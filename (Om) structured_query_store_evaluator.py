from __future__ import annotations
import portkey_ai
import json
import pandas as pd
from pyspark.sql import functions as F
from typing import Dict, Any, Optional
from abc import ABC, abstractmethod
# from databricks.sdk.runtime import *
import uuid
import os
from dotenv import load_dotenv
from typing import Dict, Any, Optional, Tuple, Literal, Mapping
from .embedding_retrieval_utils import * 
from .utils import * 
from .base_evaluator import *
from pyspark.sql import SparkSession, Row, DataFrame, functions as F
from pyspark.sql.types import *
import collections
load_dotenv()

from pydantic import BaseModel, Field
from typing import Literal



DEFAULT_SCORE_MAPPING_DICT = {
  'is_serving_matched':3,
  'is_serving_more_than_three_items':2,
  'is_primary_serving':2,
  'is_dietary_serving':3,
  'is_flavor_match':1,
  'is_ingredient_present':3,
  'is_prep_style_matched':1,
  'is_exact_restaurant':3,
  'is_similar_restaurant':2,
  'is_portion_matched':1,
  'is_group_matched':1,
  'is_nearby':2, 
  'is_fast_delivery':2,
  'is_top_rated':2,
  'is_overall_rating_good':2,
  'is_store_open':3,
  'is_price_match':2,
#   'is_all_match':3,
  'is_fast_delivery_check':2,
}
class StructuredQueryStoreEvaluator(BaseEvaluator):
    def __init__(
        self,
        user_prompt_column_names_mapping: Dict[str, str],
        structured_llm_call_output_class: type[BaseModel],
        model: str = "o3-mini",
        temperature: float = 0.0,
        max_tokens: int = 1000,
        timeout: int = 30,
        prefix: str = 'gpt',
        score_mapping_dict: Optional[Dict[str, float]] = None,
        task_type:str = 'structured_query_store_eval',
        data_save_path: str = '/dbfs/mnt/doordash-datalake/test_tmp/ml/datasets/hs/vox/',
        override_key_cols: Optional[List[str]] = None,
    ) -> None:
        """
        Evaluates <query, store> relevance using a structured LLM rubric and computes scores/metrics.

        Parameters
        ----------
        user_prompt_column_names_mapping : Dict[str, str]
            Mapping from prompt field key -> dataframe column name.
            Example: {"search_query": "query", "store_name": "store_name", ...}
        structured_llm_call_output_class : type[BaseModel]
            Pydantic model (or similar) describing the structured response schema
            expected from the LLM call (used for validation).
        model : str
            LLM model name (default "o3-mini").
        temperature : float
            LLM sampling temperature.
        max_tokens : int
            Max tokens for the LLM response.
        timeout : int
            Provider request timeout (seconds).
        prefix : str
            Column prefix for structured outputs (e.g., "gpt" → "gpt.explanation").
        score_mapping_dict : Optional[Dict[str, float]]
            Mapping rubric flag (e.g., "is_serving_matched") -> weight/score.
            If not provided, defaults to DEFAULT_SCORE_MAPPING_DICT.
        task_type : str
            Tag used for saving artifacts/outputs.
        data_save_path : str
            Base path where intermediate and final outputs are saved.
        """
        if not score_mapping_dict:
            score_mapping_dict = DEFAULT_SCORE_MAPPING_DICT
        super().__init__(user_prompt_column_names_mapping = user_prompt_column_names_mapping, 
        structured_llm_call_output_class = structured_llm_call_output_class,
        score_mapping_dict = score_mapping_dict,
        model = model,
        temperature = temperature,
        max_tokens = max_tokens,
        timeout = timeout,
        prefix = prefix,
        task_type = task_type,
        data_save_path = data_save_path,
        override_key_cols = override_key_cols
        )
        self.system_prompt = self._build_system_prompt()


    def _build_system_prompt(self) -> str:
        """
        load the system prompt
        """
        return """
        You are an expert evaluator for food delivery <query, store> relevance based on rubrics and with the following inputs:
        - search_query
        - store_name
        - most_relevant_20_items_in_the_store (in the format of a string in "[name: item_1_name, menu_category: item_1_menu_category...], [name: item_2_name, menu_category: item_2_menu_category...], ..".
        - store_summary
        - store_price_dollar_sign
        - store_rating
        - store_and_consumer_distance_miles
        - store_eta_minute
        - store_address
        - whether_the_store_is_open

        IDENTIFY QUERY CATEGORIES: 
        Classify the structured_query into exactly ONE MAJOR CATEGORY of:
        - dish: names a specific dish or a dish family with/without attributes (e.g., "burger", "chicken tikka masala", "ramen", "spicy burger", "vegan burger")
        - cuisine: names a cuisine with/without attributes (e.g., "thai", "japanese", "mexican", "mediterranean", "healthy thai")
        - restaurant: names a restaurant/brand (e.g., "Chipotle", "Marnee Thai")
        - attribute_only: only flavor/dietary/price/portion/prep/distance/speed/popularity/quality terms, with NO dish and NO cuisine (e.g., "cheap spicy vegetarian", "gluten free", "under $20 healthy dinner")
        - ambiguous: unclear after reasonable effort

        IMPORTANT HARD RULE:
        - If query_type = attribute_only (or ambiguous with no dish/cuisine evidence), then for is_serving_matched, is_serving_more_than_three_items, and is_primary_serving, the answer must be NA. 

        CORE CATEGORY RUBRICS (dish queries) - w means weight
        - is_serving_matched (w=3): NA if the query is not asking for specific cuisine and not for specific dish names (e.g. NA if query is only asking best spicy, top rated best vegetarian, for food under 39 min, or "affordable/cheap" etc); Y if store clearly serves the named dish (≥1); N otherwise.
        - is_serving_more_than_three_items (w=2): NA if the query is not asking for specific cuisine and not for specific dish names (e.g. NA if query is only asking best spicy, top rated best vegetarian, for food under 39min, or "affordable/cheap" etc); Y if ≥3 items of that dish type exist; N otherwise.
        - E.g. query = Shrimp tacos near me, we will look if the Rx has > 3 tacos not > 3 shrimp tacos, if a store has 3 tacos, then yes.
        - is_dietary_serving (w=3): NA if dietaty constraints (e.g. gluten-free, vegan, halal, kosher, healthy, high-protein etc) is not mentioned in search_query; Y if the store serves ≥1 requested dish that meets both requsted dish type and the dietary constraints (including customization), else N. 
        - Note on "healthy": as long as the dish is rich of vegetables, with minimum amount of oil and fat and with protein, then it's healthy. Besides vegan/vegetarian are also considered as healthy.
        - There are common matching for some dietary, e.g. traditional sushi are treated as "gluten free", traditional tacos with corn tortillas are "gluten free". 
        - If there are one dish that meet the dietary constraint while it's not the requested dish type, then still N. e.g. "vegan burrito", but a store only provides "vegan taco", it's still a N.
        - is_flavor_match (w=1): NA if flavor (e.g. spicy, sweet, sour etc) is not mentioned in search_query ("cheesy" is ingredient constraints not flavor); Y if ≥1 item matches both the dish request and the flavor request, else N. 
        - is_ingredient_present (w=3):NA: Use when the query’s dish/cuisine already embeds the ingredient, or it’s a cuisine-only query (e.g., “chicken tenders,” “fried chicken,” “potato fries,” “grilled beef/lamb/chicken/salmon,” “Italian,” “Thai”); Y: The named ingredient is clearly present in the requested item available at the store, otherwise N. 
        - Notes:“High protein” is a dietary constraint, not an ingredient; “Cheesy” is an ingredient constraint, not a flavor.
        - For queries like “chicken salad” (dish type + specified ingredient), choose Y or N — not NA
        - is_prep_style_matched (w=1): NA if prep style (e.g. grilled, baked, bbq, fried, steamed etc, note - mashed is not prep_style) is not mentioned in search_query; Y if ≥1 item matches the dish request and the prep style request (e.g. grilled, fried), else N. 
        - is_portion_matched (w=1): NA if portion (e.g. large, small plate etc) is not mentioned in search_query; Y if >=1 matched item's portion (large, small, medium) meet the request, else N.
        - is_group_matched (w=1): NA if group information (e.g. for family, for groups, for couple, for party, for x people etc) is not mentioned in search_query; Y if ≥1 item matches the dish request and it's platter/combo etc or meet the portion request, else N.
        - is_exact_restaurant (w=3): NA if the search_query is not about restaurant_name; Y if store == named_restaurant; N else.
        - is_similar_restaurant (w=2): NA if the search_query is not about restaurant_name; Y if store serves same cuisine as the named_restaurant; N else.

        CORE CATEGORY RUBRICS (cuisine queries)
        - is_serving_matched (w=3): NA if the query is not asking for specific cuisine and not for specific dish names (e.g. NA if query is only asking best spicy, top rated best vegetarian, for food under 39min, or "affordable/cheap" etc); Y if store clearly serves the cuisine (≥1 items); N otherwise. 
        - is_serving_more_than_three_items (w=2): NA if the query is not asking for specific cuisine and not for specific dish names (e.g. NA if query is only asking best spicy, top rated best vegetarian, for food under 39min, or "affordable/cheap" etc); Y if ≥3 items of that cuisine exist; N otherwise. note: when evaluate for this primary serving, only look into the cuisine or dish type, and ignore modifiers (e.g. "healthy italian", one italian pizza store serves 3+ italian dishes is still yes)
        - is_dietary_serving (w=3): NA if dietary constraints is not mentioned; Y if ≥2 dishes meet dietary constraints (including customization); else N.
        - is_flavor_match (w=1): NA if flavor (note: cheesy is not a flavor term but an ingredient term) is not mentioned in search_query; Y if ≥2 relevant dishes in that cuisine match requested flavor/prep/portion, else N. 
        - is_ingredient_present (w=3): NA as long as the query is asking for cuisine. 
        - is_prep_style_matched (w=1):  NA if cooking preperation style (e.g. grilled, baked, bbq, fried, steamed etc, note - mashed is not prep_style) is not mentioned in search_query; Y if ≥2 relevant dishes in that cuisine match requested preperation style, else N. 
        - is_portion_matched (w=1): NA if portion (e.g. large, small plate etc) is not mentioned in search_query; Y if >=1 matched item's portion (large, small, medium) meet the request, else N.
        - is_group_matched (w=1): NA if group information (e.g. for family, for groups, for couple, for party, for x people etc) is not mentioned in search_query; Y if ≥1 item matches the dish request and it's platter/combo etc or meet the portion request, else N.
        - is_exact_restaurant (w=3): NA if the search_query is not about restaurant_name; Y if store == named_restaurant; N else.
        - is_similar_restaurant (w=2): NA if the search_query is not about restaurant_name; Y if store serves same cuisine as the named_restaurant; N else.
 

        STORE OTHER CATEGORY RUBRICS (for both cuisine and dietary queries)
        - is_primary_serving (w=2): NA if the query is not asking for specific cuisine and not for specific dish names (e.g. NA if query is only asking best spicy, top rated best vegetarian, for food under 39min, or "affordable/cheap" etc); Y if the requested item is also in primary_food_types or the requested cuisine is in cuisine_types in store_summary; N otherwise.
        - is_nearby (w=2): NA if location contraint (e.g. near me, near mission street, in chinatown, in x miles etc) is not mentioned; Y if store_and_consumer_distance_miles ≤ 2); else N. 
        - is_fast_delivery (w=2): NA if speed constraint (e.g. fast, quick, under X minutes etc) is not mentioned; Y if eta_minutes ≤ speed_cap_minutes(speed_cap_minutes if specified then X else 39) when speed is requested; else N. 
        - is_top_rated (w=2): NA if top rating constraint (e.g. best, most popular, popular, top rated) is not mentioned; Y if store rating >=4.7; else N.
        - is_store_open (w=3): Check the input flag of whether_the_store_is_open. Y if it's open; else N.
        - is_overall_rating_good (w=2): Y if store rating>=4.5; else N. 
        - is_price_match (w=2): NA if price constraint (e.g. under $ X etc, 'affordable', 'cheap' etc) is not mentioned, please note "BOGO" or "PROMO" or "DEAL" are not price constraints, if they show up, mark NA as well; 
        - If the query is about dish, Y if the MATCHED dish is under price_cap or when item price is not available, as long as the store has '$' or '$$' dollar sign, it's still Y;
        - If the query is about cuisine, Y if the mentioned cuisine has ≥2 dishes that meet the price_cap; if item price is not available, as long as the store has '$' or '$$' dollar sign, it's still Y;
        - else N. 
        - example: "seafood under $20" if the store serves main seafood dishes under $20, it's Y; "burrito under $20", if the store doesn't serve burrito but serves pizza under $20, it's a N as dish is not matched.

        OVERALL CHECK CATEGORY RUBRICS (for both cuisine and dietary queries)
        - is_all_match (w=3) (only allow Y/N for this question): Y if there is ≥1 item that matches every modifier and main dish / cuisine mentioned in the query; else N. 


        OUTPUT FORMAT:
        - A JSON string with the following format:
        {{
        "label": " `relevant` (if all non-NA critiria is Y), "`not relevant` for the rest cases", 
        "explaination": "<Must be a string and follow the format instruction>".
        }}
        The explaination Must follow the format and ensure all critirias are mentioned: 
        "Y | string seperate by comma of critiria names; N | string seperate by comma of critiria names; NA | string seperate by comma of critiria names; SUM | Sum score of Y; RATIONAL | One sentence to explain why the N critiria"
        """
    def _add_store_profile(self,top20_per_store_: pyspark.sql.DataFrame) -> pyspark.sql.DataFrame:
        """
        Extract a compact store profile (overall facets + summary) and attach a
        core-item-profile projection for the top-20 items.

        Parameters
        ----------
        top20_per_store_ : pyspark.sql.DataFrame
            DataFrame that includes columns:
            - most_relevant_top_20_items : array/json string of item profiles
            - store_profile : json string {overall_profile: {...}, summary: "...", ...}

        Returns
        -------
        pyspark.sql.DataFrame
            Input DataFrame with:
            - most_relevant_20_items_in_the_store_core_category : string summary of selected keys
            - store_summary: compacted store profile (JSON string)
        """
        import json
        @udf(returnType=StringType())
        def extract_store_profile(store_profile):
            try:
                dct = json.loads(store_profile)
                new_output_dct = {
                'overall_profile': {},
                'summary': ''
                }
                for overall_key in ['food_types','cuisine_types', 'dietary_options','flavor_types','service_quality']:
                    print('overall_profile' in dct)
                    if overall_key=='food_types':
                        try:
                            primary_food_types = dct['overall_profile'][overall_key].get('primary_food_types','')
                        except:
                            primary_food_types = dct['overall_profile'][overall_key]
                        new_output_dct['overall_profile']['food_types'] = primary_food_types
                    else:
                        new_output_dct['overall_profile'][overall_key] = dct['overall_profile'][overall_key]
                    new_output_dct['summary'] = dct['summary']
                    
                return json.dumps(new_output_dct, ensure_ascii=False)
            except Exception as e:
                print(f'error = {e}')
                return store_profile
       
        # top20_per_store_=spark.read.parquet('/mnt/doordash-datalake/test_tmp/ml/datasets/hs/prod_scraper_0916_transformed_top_20_items')

        print(top20_per_store_.count())
        extra_item_profile_key_pairs = [('identity','name'), ('identity','menu_category'), ('identity','description'), ('identity','cuisines'), ('identity','food_types'),('identity','dietary_preferences'), ('composition', 'allergen_flags'),('composition','optional_customizations'), ('identity','portion_size'), ('operational_signals','kid_friendly'), ('identity','price')]
        extra_pair_str = json.dumps(extra_item_profile_key_pairs or [])
        top20_per_store_ = top20_per_store_.withColumn(f'most_relevant_20_items_in_the_store_core_category',get_profile_descriptions_by_keys(F.col('most_relevant_top_20_items'), F.lit(extra_pair_str))) ## for item profile
        top20_per_store_ = top20_per_store_.withColumn('store_summary', extract_store_profile(F.col('store_profile')))
        return top20_per_store_
    
    def collect_dedup_unique_keys(self,df:Union[pd.DataFrame,pyspark.sql.DataFrame])->List[str]:
        if self.override_key_cols:
            return self.override_key_cols
        missing_cols = [a for a in {'query','daypart','store_id'} if a not in df.columns]
        if len(missing_cols)!=0:
            raise ValueError(f"Missing required columns: {', '.join(missing_cols)}!")
        dedup_cols = ['query','daypart','store_id']
        if 'hour_bucket' in df.columns:
            dedup_cols+=['hour_bucket']
        if 'weekday' in df.columns:
            dedup_cols+=['weekday']
        if 'request_time' in df.columns:
            dedup_cols+=['request_time']
        if 'query_id_identifier' in df.columns: # added by james.zhao should be nop for any other use cases due to unique name
            dedup_cols+=['query_id_identifier']
            print("‼️ using query_id_identifier! ‼️")
        return dedup_cols
    
    def _prepare_data(self, df: pd.DataFrame, **kwargs):
        """
        preprocess data to add most relevant 20 items, store info (eta, store summary etc)
        """
        model_emb_config = {
        "model_provider": 'gemini',
        # "model":'text-embedding-005', 
        "model":'gemini-embedding-001', 
        "task_type": 'RETRIEVAL_QUERY',
        'base_url': "http://cybertron-service-gateway.svc.ddnw.net:8080/v1",
        'api_key': os.getenv("PORTKEY_API_KEY"),
        'virtual_key':  os.getenv("VERTEX_AI_VIRTUAL_API_KEY")
        }
        dedup_cols = self.collect_dedup_unique_keys(df)
        df_all_dedup = df.drop_duplicates(subset=dedup_cols)
        df_all_dedup = df_all_dedup.reset_index(drop=True)  
        spark = SparkSession.builder.getOrCreate()
        df_all_dedup = spark.createDataFrame(df_all_dedup) 
        top20_per_store_, top20_per_store = fetch_top_20_most_relevant_items_within_store(df_all_dedup, model_emb_config,is_use_partial_item_profile = False, dedup_cols = dedup_cols)
        top20_per_store_ = self._add_store_profile(top20_per_store_)
        print(top20_per_store_.count())
        # add back carousel titles
        
        self.save_data(top20_per_store_, 'preprocess_data')
        return top20_per_store_
    

    def _postprocess_data(self, df:pd.DataFrame,df_orig:pd.DataFrame, **kwargs) -> pd.DataFrame:
        """postprocess output and join with original data to recover anything after dedup"""
        df_orig_cols = list(df.columns)
        out = expand_explaination_columns(
        df = df, 
        # columns = ['core_category_explanation', 'store_other_category_explanation'],
        columns = [f'{self.prefix}.explanation'],
        default_status = "NA",
        status_mapping = {"Y": "Yes", "N": "No", "NA": "NA to Query"}
        )
        out.loc[out['is_exact_restaurant']=='Yes', 'is_similar_restaurant']='Yes'
        out.loc[out['is_exact_restaurant']=='Yes', 'is_similar_restaurant']='Yes'
        
        out['is_store_open'] = out['whether_the_store_is_open'].apply(lambda x: 'Yes' if x==1 else 'No')
        out['is_overall_rating_good'] = out['store_average_rating'].apply(lambda x: 'Yes' if x and float(x)>=4.5 else 'No')
        def process_eta(eta):
            try:
                eta_num = int(eta.replace('min','').strip())
                return 'Yes' if eta_num<=39 else 'No'
            except Exception as e:
                return f'NA + {e}'


        out['is_fast_delivery_check'] = out['store_eta'].apply(lambda x: process_eta(x))
        out.loc[out['is_fast_delivery']!='NA to Query','is_fast_delivery'] = out[out['is_fast_delivery']!='NA to Query']['store_eta'].apply(lambda x: process_eta(x))
        out['is_store_open'] = out['store_display_asap_time'].apply(lambda x: 'Yes' if 'close' not in x.lower() else 'No')


        out[["weighted_score_pct", "earned_pts", "applicable_pts"]] = out.apply(
            lambda r: pd.Series(compute_row_score(r, self.score_mapping_dict, return_details=True)),
            axis=1
        )
        df_orig['store_id'] = df_orig['store_id'].astype(str)
        out['store_id'] = out['store_id'].astype(str)
        if 'hour_bucket' in df_orig.columns:
            df_orig['hour_bucket'] = df_orig['hour_bucket'].astype(str)
            out['hour_bucket'] = out['hour_bucket'].astype(str)

        selected_cols = df_orig_cols + list(self.score_mapping_dict.keys()) + ["weighted_score_pct", "earned_pts", "applicable_pts"] + [f'{self.prefix}.explanation__rational']
        selected_cols += [a for a in df_orig.columns if a not in selected_cols]
        selected_cols = [a for a in selected_cols if a not in {'most_relevant_top_20_items','store_open_hour_map_dct'}]
        print(f'--- selected_cols = {selected_cols}')
        out_join = df_orig.merge(out,on = self.collect_dedup_unique_keys(df_orig),how='inner', suffixes = ['', '_join'])
        try:
            self.save_data(out_join[selected_cols], 'postprocess_data')
        except Exception as e:
            print(f'error = {e}')
        return out_join[selected_cols] 

            
    
    def _compute_ndcg_by_query_category(self,df:pd.DataFrame,category_col:str,k=5, is_join_category=True,sot_query_scraping_path = None)->pd.DataFrame:
        """
        Reuse `compute_ndcg_for_df` per category.

        Returns:
        - per-query NDCG with category column attached
            columns ~ ['query', 'ndcg@5', 'ndcg@10', ..., category_col]
        - per-category overall NDCG@k dataframe
            columns ~ [category_col, 'ndcg@5', 'ndcg@10', ...]
        """

        score_facet_to_category_mapping = {
            'main_dish___cuisine':[('is_serving_matched',3),('is_primary_serving',3),('is_serving_more_than_three_items',1)],
            'dietary_restrictions':[('is_dietary_serving',1)],
            'restaurant___store_name':[('is_exact_restaurant',3),('is_similar_restaurant',2)],
            'flavor':[('is_flavor_match',1)],
            'preparation_style':[('is_prep_style_matched',1)],
            'portion_size':[('is_portion_matched',1)],
            'groups':[('is_group_matched',1)],
            'ingredients':[('is_ingredient_present',1)],
            'location':[('is_nearby',1)],
            'speed':[('is_fast_delivery',1),('is_fast_delivery_check',2)],
            'quality___rating':[('is_top_rated',1),('is_overall_rating_good',1)],
            'price':[('is_price_match',1)],
            'open_hour_check':[('is_store_open',1)],
            'quality_rating_larger_than_45':[('is_overall_rating_good',1)],
        }

        per_query_frames = []
        overall_rows = []
        
        if is_join_category:
            df_cat_all=pd.read_csv('/dbfs/FileStore/heathersong/llm_as_judge/Structured_Query_Evaluation_category_sot_v2.csv')
            all_categories = list(score_facet_to_category_mapping.keys())
            df_cat_all = df_cat_all.drop('Unnamed: 0', axis=1).groupby('query')['query_category'].apply(list).reset_index()
            df_cat_all['query_category'] = df_cat_all['query_category'].apply(lambda x: ','.join(x))
            df_join = df.merge(df_cat_all,on='query',how='inner')
        else:
            df_join = df.copy()
        metric_dct = collections.defaultdict(list)
        for cat in all_categories:
            df_sub = df_join[df_join['query_category'].str.contains(cat)]
            if cat not in score_facet_to_category_mapping:
                print(f'category {cat} is not covered in current llm-as-a-judge!')
                continue
            def map_score(row, cat):
                sum_score=0.0
                true_score=0.0
                for col_name, score in score_facet_to_category_mapping[cat]:
                    sum_score+=score
                    multi = 1.0 if row[col_name]=='Yes' else 0.0
                    true_score+= (1.0 if row[col_name]=='Yes' else 0.0) * score
                return true_score/sum_score * 100
            
            df_sub['relevance_score'] = df_sub.apply(lambda x: map_score(x, cat),axis=1)
            per_query_df, overall_ndcg = compute_wpr_at_k(
                df_orig=df_sub,
                k=k,
                relevance_score_col_name = 'relevance_score',
                rank_col_name = 'rank_position',
                id_col = 'query_id'
            )
            if sot_query_scraping_path:
                df_cat_all=pd.read_csv(sot_query_scraping_path)
                subs_cols = {'query_text':"query", 'day_part':'daypart'}
                df_cat_all.columns = [subs_cols.get(a.lower(),a.lower()) for a in df_cat_all.columns]
                df_cat_all_cp = df_cat_all[['query','daypart']].copy()
                for daypart in ['breakfast','lunch','dinner']:
                    df_cat_all_tmp = df_cat_all[['query','daypart']].copy()
                    df_cat_all_tmp['daypart'] = daypart
                    df_cat_all_cp = pd.concat([df_cat_all_cp,df_cat_all_tmp ],axis=0)
                df_cat_all = df_cat_all_cp.drop_duplicates()
                per_query_df = df_cat_all.merge(per_query_df, on=['query','daypart'], how='left')
                per_query_df = per_query_df.fillna({'weighted_score':0.0, 'weighted_score_pct':0.0, 'relevance_score':0.0})
                per_query_df['successful_scraped_cnt'] = 1
                per_query_df.loc[per_query_df['query_id'].isna(),'successful_scraped_cnt']=0

            metric_dct['query_category'].append(cat)
            metric_dct['ndcg@5'].append(overall_ndcg)
            metric_dct['count'].append(per_query_df.shape[0])
            
            metric_dct['average_relevance_score'].append(df_sub['relevance_score'].mean()/100.0)

        return pd.DataFrame(metric_dct)
                
    def _compute_facet_level_ndcg(self, df, k=5, rank_col_name = 'rank_position', id_col = 'query_id',dedup_cols = [],sot_query_scraping_path=None):
        import collections
        dct_query_facet_level,df_metric = pd.DataFrame(), collections.defaultdict(list)
        def match_is_personalized_facet_score(row):
            if row['is_personalization_reflected']=='Yes' and row['is_personalization_reflected_weight']>0:
                return 1.0
            elif row['is_personalization_reflected']=='No' and row['is_personalization_reflected_weight']<0:
                return 1.0
            else:
                return 0.0
            
        for col in DEFAULT_SCORE_MAPPING_DICT.keys():
            try:
                if col =='is_personalization_reflected':
                    df[f'{col}_score'] = df.apply(lambda row: match_is_personalized_facet_score(row),axis=1)
                else:
                    df[f'{col}_score'] = df[col].apply(lambda x: 1.0 if x=='Yes' else 0.0)
                df_metric_query_level, ndcg_k = compute_wpr_at_k(df_orig = df[df[col]!='NA to Query'], k = k, rank_col_name = rank_col_name, id_col = id_col, relevance_score_col_name = f'{col}_score', is_divide_100_needed=False)


                df_metric_query_level[dedup_cols] = df_metric_query_level["query_id"].str.split("|", expand=True)
                # print(df_metric_query_level.columns)
                dct_query_facet_level = pd.concat([dct_query_facet_level,df_metric_query_level ],axis=0)
                df_metric['facet'].append(col)
                df_metric['ndcg_k'].append(ndcg_k)
                df_metric['count'].append(df_metric_query_level.shape[0])
            except Exception as e:
                print(f'-- facet = {col}, exception = {e}')
                continue
        return dct_query_facet_level, pd.DataFrame(df_metric)



    def _compute_metrics(self, df:pd.DataFrame, k:int,rank_col_name:str, id_cols:List[str], category_col:str=None, 
                         sot_query_scraping_path:Optional[str] = None, 
                         **kwargs):
        """
        compute metrics all together
        """
        dedup_cols = id_cols
        if 'query_id' in df.columns:
            print('query_id in columns')
            df = df.drop('query_id', axis=1)
            print(f'{"query_id" in df.columns}')
        

        df["query_id"] = (
            df[dedup_cols]
            .astype("string")   # safe for mixed types
            .fillna("")         # avoid "nan" strings
            .agg("|".join, axis=1)
        )



        df_metric_query_level, ndcg_k = compute_wpr_at_k(df_orig = df, k = k, rank_col_name = rank_col_name, id_col = 'query_id')
        print(ndcg_k)
        # print(f' ndcg@{k} = {ndcg_k}')
        df_metric_query_level = unpack_query_id_columns(df_metric_query_level,column_names = dedup_cols, query_id_col = 'query_id')
        df_metric_query_level_orig = df_metric_query_level.copy()
        if sot_query_scraping_path:
            df_cat_all=pd.read_csv(sot_query_scraping_path)
            subs_cols = {'query_text':"query", 'day_part':'daypart'}
            df_cat_all.columns = [subs_cols.get(a.lower(),a.lower()) for a in df_cat_all.columns]
            df_cat_all_cp = df_cat_all[['query','daypart']].copy()
            for daypart in ['breakfast','lunch','dinner']:
                df_cat_all_tmp = df_cat_all[['query','daypart']].copy()
                df_cat_all_tmp['daypart'] = daypart
                df_cat_all_cp = pd.concat([df_cat_all_cp,df_cat_all_tmp ],axis=0)
            df_cat_all = df_cat_all_cp.drop_duplicates()
            df_metric_query_level = df_cat_all.merge(df_metric_query_level, on=['query','daypart'], how='left')
            df_metric_query_level = df_metric_query_level.fillna({'weighted_score':0.0, 'weighted_score_pct':0.0, 'relevance_score':0.0})
            df_metric_query_level['successful_scraped_cnt'] = 1
            df_metric_query_level.loc[df_metric_query_level['query_id'].isna(),'successful_scraped_cnt']=0

        ndcg_k = df_metric_query_level['weighted_score'].mean()
        print(f' ndcg@{k} = {ndcg_k}')
        df_metric_query_level_cat = None
        if category_col:
            is_join_category = (category_col =='query_category')
            if category_col =='query_category':
                if 'query_category' not in df_metric_query_level.columns:
                    df_cat_all=pd.read_csv('/dbfs/FileStore/heathersong/llm_as_judge/Structured_Query_Evaluation_category_sot_v2.csv')
                    df_cat_all = df_cat_all[['query']].drop_duplicates()
                    df_metric_query_level = df_cat_all.merge(df_metric_query_level, on='query', how='left')
                    df_metric_query_level = df_metric_query_level.fillna({'weighted_score':0.0, 'weighted_score_pct':0.0, 'relevance_score':0.0})


                df_metric_query_level_cat = self._compute_ndcg_by_query_category(df, category_col,is_join_category)
                df_metric_query_level_cat['daypart'] = 'overall'
                dp_lst = [df_metric_query_level_cat]
                for dp in list(df_metric_query_level['daypart'].unique()):
                    print(f'dp = {dp}')
                    df_dp = self._compute_ndcg_by_query_category(df[df['daypart']==dp], category_col,is_join_category) 
                    df_dp['daypart'] = dp
                    dp_lst.append(df_dp)
                df_metric_query_level_cat = pd.concat(dp_lst)
            else:
                if 'successful_scraped_cnt' not in df_metric_query_level.columns:
                    df_metric_query_level['successful_scraped_cnt'] = 1
                df_metric_query_level['total_cnt']=1
                df_metric_query_level_cat = df_metric_query_level.groupby(category_col).agg({
                    'weighted_score':'mean',
                    'successful_scraped_cnt': 'sum',
                    'total_cnt':'count'
                }).reset_index()
                # .rename(columns={'daypart':'scraping_cnt','cnt':'success_cnt'})
        
        facet_level_query_df, facet_level_metric_df = self._compute_facet_level_ndcg(df=df, k=k, rank_col_name = rank_col_name, id_col = 'query_id',dedup_cols =dedup_cols, sot_query_scraping_path = sot_query_scraping_path)
        
        return {
            'ndcg_query_level_df_orig': df_metric_query_level_orig,
            "ndcg_query_level_df": df_metric_query_level,
            "ndcg_k": ndcg_k,
            "ndcg_category_level_df": df_metric_query_level_cat,
            'ndcf_facet_level_df': facet_level_query_df,
            'ndcg_facet_level_metric_df':facet_level_metric_df
        }



## preprocess