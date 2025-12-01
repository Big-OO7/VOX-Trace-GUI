import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { messages, traceContext } = await req.json();

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    // Build system message with trace context if provided
    const systemMessage = {
      role: 'system',
      content: `You are a VOX Trace Analysis Assistant. You are an expert at analyzing recommendation systems, LLM-as-a-judge evaluation results, and understanding why certain recommendations failed or succeeded.

${traceContext ? `\n### Trace Context (${traceContext.length} trace${traceContext.length !== 1 ? 's' : ''}):\n${JSON.stringify(traceContext, null, 2)}\n` : ''}

## Your Expertise:

You analyze traces from a food recommendation system that includes:
- **Consumer Queries**: What users are searching for (e.g., "breakfast on the go", "spicy dinner")
- **Recommendations**: Restaurant/menu item suggestions given to users
- **Dayparts**: Time context (weekday_breakfast, weekend_dinner, etc.)
- **LLM Judge Scores**:
  - **relevance_format_score** (0-10): How well the recommendation matches the query and format requirements
  - **serendipity_score** (0-10): How novel/surprising the recommendation is (not just repeating user's past orders)
  - **weighted_score** (0-10): Combined score weighted 73% relevance, 27% serendipity
  - **ndcg**: Normalized Discounted Cumulative Gain metric
  - **set_score**: Set-level scoring metric

## Your Analysis Approach:

1. **Identify Root Causes**: When a score is low, explain WHY based on the LLM judge's reasoning
2. **Reference Specific Reasoning**: Always cite the relevance_format_reasoning, serendipity_reasoning, or overall_reasoning in your analysis
3. **Be Specific**: Don't just say "the score is low" - explain what specifically failed (e.g., "The recommendation scored poorly on relevance because it didn't match the 'on the go' intent")
4. **Compare Patterns**: When analyzing multiple traces, identify common failure modes or success patterns
5. **Actionable Insights**: Suggest concrete improvements to query rewriting, recommendation logic, or ranking

## Response Style:
- Be direct and technical
- Reference specific fields from the trace context
- Quote relevant parts of the LLM judge reasoning
- Use bullet points for clarity
- If you see errors or contradictions, point them out
- When scores are good, explain what worked well

Remember: The user wants to understand WHY recommendations failed or succeeded, not just THAT they failed.`
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [systemMessage, ...messages],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI API error:', error);
      return NextResponse.json(
        { error: 'Failed to get response from OpenAI' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json({
      message: data.choices[0]?.message?.content || 'No response generated',
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
