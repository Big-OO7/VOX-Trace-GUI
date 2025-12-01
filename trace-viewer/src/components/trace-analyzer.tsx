"use client";

import { useState, useEffect, useRef } from 'react';
import { Search, Send, Loader2, Upload, AlertCircle, Bot, User, X, FileText } from 'lucide-react';
import Papa from 'papaparse';
import type { TraceRecord, GradingData, FuzzyGradingData } from '@/lib/trace-utils';
import { buildTraceRecords } from '@/lib/trace-utils';
import type { GradeRecord } from '@/lib/grade-types';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  traceRefs?: string[];
}

interface EnrichedTrace {
  conversationId: string;
  consumerId: string;
  query: string;
  recommendation: string;
  daypart: string;
  gradeRecord: GradeRecord;
}

export default function TraceAnalyzer() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [gradeData, setGradeData] = useState<GradeRecord[]>([]);
  const [qrGradeData, setQRGradeData] = useState<GradeRecord[]>([]);
  const [selectedTraces, setSelectedTraces] = useState<EnrichedTrace[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showTracePicker, setShowTracePicker] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load all grade data on mount
  useEffect(() => {
    loadAllGradeData();
  }, []);

  const loadAllGradeData = async () => {
    setDataLoading(true);
    try {
      // Load main grade data
      const dataResponse = await fetch('/data.csv');
      const dataText = await dataResponse.text();

      // Load QR grade data
      const qrResponse = await fetch('/qr-data.csv');
      const qrText = await qrResponse.text();

      Papa.parse<GradeRecord>(dataText, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results) => {
          const filtered = results.data.filter((row) => row.consumer_id && row.query);
          setGradeData(filtered);
        },
      });

      Papa.parse<GradeRecord>(qrText, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results) => {
          const filtered = results.data.filter((row) => row.consumer_id && row.query);
          setQRGradeData(filtered);
        },
      });
    } catch (error) {
      console.error('Error loading grade data:', error);
    } finally {
      setDataLoading(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: input,
      traceRefs: selectedTraces.map(t => `${t.consumerId}-${t.query.substring(0, 20)}`),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Build comprehensive context from selected traces
      const traceContext = selectedTraces.map(trace => ({
        consumer_id: trace.consumerId,
        query: trace.query,
        recommendation: trace.recommendation,
        daypart: trace.daypart,

        // Scores
        relevance_format_score: trace.gradeRecord.relevance_format_score,
        serendipity_score: trace.gradeRecord.serendipity_score,
        weighted_score: trace.gradeRecord.weighted_score,
        ndcg: trace.gradeRecord.ndcg,
        set_score: trace.gradeRecord.set_score,

        // LLM Judge Reasoning
        relevance_format_reasoning: trace.gradeRecord.relevance_format_reasoning,
        serendipity_reasoning: trace.gradeRecord.serendipity_reasoning,
        overall_reasoning: trace.gradeRecord.overall_reasoning,
      }));

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages.map(m => ({
            role: m.role,
            content: m.content,
          })),
          traceContext: traceContext.length > 0 ? traceContext : null,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();
      const assistantMessage: Message = {
        role: 'assistant',
        content: data.message,
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please make sure the OpenAI API key is configured in your environment variables.',
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddTrace = (record: GradeRecord) => {
    const trace: EnrichedTrace = {
      conversationId: `${record.consumer_id}-${record.query}`,
      consumerId: record.consumer_id.toString(),
      query: record.query,
      recommendation: record.recommendation,
      daypart: record.daypart,
      gradeRecord: record,
    };

    if (!selectedTraces.find(t => t.conversationId === trace.conversationId)) {
      setSelectedTraces(prev => [...prev, trace]);
    }
    setShowTracePicker(false);
  };

  const handleRemoveTrace = (conversationId: string) => {
    setSelectedTraces(prev => prev.filter(t => t.conversationId !== conversationId));
  };

  const allGradeRecords = [...gradeData, ...qrGradeData];
  const filteredRecords = allGradeRecords.filter(record => {
    const searchLower = searchTerm.toLowerCase();
    return (
      record.consumer_id?.toString().toLowerCase().includes(searchLower) ||
      record.query?.toLowerCase().includes(searchLower) ||
      record.recommendation?.toLowerCase().includes(searchLower) ||
      record.daypart?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="flex gap-6 h-[calc(100vh-280px)]">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-white border border-black/10 rounded-lg overflow-hidden">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Bot className="w-16 h-16 text-black/20 mb-4" />
              <h3 className="text-xl font-semibold text-black mb-2">
                AI Trace Analysis Assistant
              </h3>
              <p className="text-black/50 max-w-md mb-4">
                Select traces from the panel to add context, then ask questions about performance, grading, recommendations, and errors.
              </p>
              <div className="text-sm text-black/40 space-y-1">
                <p>• {allGradeRecords.length} graded traces available</p>
                <p>• Includes full LLM judge reasoning</p>
                <p>• Ask about relevance, serendipity, or overall scores</p>
              </div>
            </div>
          )}

          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.role === 'assistant' && (
                <div className="flex-shrink-0 w-8 h-8 bg-black rounded-full flex items-center justify-center">
                  <Bot className="w-5 h-5 text-white" />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-lg px-4 py-3 ${
                  message.role === 'user'
                    ? 'bg-black text-white'
                    : 'bg-black/5 text-black border border-black/10'
                }`}
              >
                <div className="whitespace-pre-wrap">{message.content}</div>
                {message.traceRefs && message.traceRefs.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-white/20 text-xs opacity-70">
                    Context: {message.traceRefs.length} trace{message.traceRefs.length !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
              {message.role === 'user' && (
                <div className="flex-shrink-0 w-8 h-8 bg-black/10 rounded-full flex items-center justify-center">
                  <User className="w-5 h-5 text-black" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="flex-shrink-0 w-8 h-8 bg-black rounded-full flex items-center justify-center">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="bg-black/5 rounded-lg px-4 py-3 border border-black/10">
                <Loader2 className="w-5 h-5 animate-spin text-black/50" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Selected Traces Context Bar */}
        {selectedTraces.length > 0 && (
          <div className="px-6 py-3 border-t border-black/10 bg-black/5">
            <div className="text-xs font-medium text-black/50 mb-2">
              Context ({selectedTraces.length} trace{selectedTraces.length !== 1 ? 's' : ''}):
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedTraces.map(trace => (
                <div
                  key={trace.conversationId}
                  className="inline-flex items-center gap-2 bg-white border border-black/10 rounded-md px-3 py-1.5 text-sm"
                >
                  <FileText className="w-3 h-3 text-black/40" />
                  <span className="font-medium">{trace.consumerId}</span>
                  <span className="text-black/50">·</span>
                  <span className="text-black/60 max-w-[200px] truncate">{trace.query}</span>
                  <button
                    onClick={() => handleRemoveTrace(trace.conversationId)}
                    className="text-black/40 hover:text-black ml-1"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Input Area */}
        <div className="p-4 border-t border-black/10">
          <div className="flex gap-2">
            <button
              onClick={() => setShowTracePicker(!showTracePicker)}
              className={`px-4 py-2 border rounded-lg text-sm font-medium transition ${
                showTracePicker
                  ? 'bg-black text-white border-black'
                  : 'bg-black/5 hover:bg-black/10 border-black/10'
              }`}
              title="Add trace context"
            >
              @ Add Trace
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder={selectedTraces.length > 0 ? "Ask about the selected traces..." : "Select traces first, then ask questions..."}
              disabled={selectedTraces.length === 0}
              className="flex-1 px-4 py-2 border border-black/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/20 disabled:bg-black/5 disabled:cursor-not-allowed"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading || selectedTraces.length === 0}
              className="px-6 py-2 bg-black text-white rounded-lg font-medium hover:bg-black/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
          {selectedTraces.length === 0 && (
            <div className="mt-2 text-xs text-black/40">
              Click "@ Add Trace" to select traces for analysis
            </div>
          )}
        </div>
      </div>

      {/* Side Panel - Trace Browser */}
      <div className="w-96 bg-white border border-black/10 rounded-lg overflow-hidden flex flex-col">
        <div className="p-4 border-b border-black/10">
          <h3 className="text-lg font-semibold text-black mb-3">Available Traces</h3>

          {dataLoading ? (
            <div className="flex items-center gap-2 text-sm text-black/50">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading grade data...
            </div>
          ) : (
            <div className="text-sm text-black/60">
              {allGradeRecords.length} graded traces
            </div>
          )}
        </div>

        <div className="p-4 border-b border-black/10">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-black/40" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by query, consumer, etc..."
              className="w-full pl-10 pr-4 py-2 border border-black/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-2">
            {filteredRecords.map((record, idx) => {
              const traceId = `${record.consumer_id}-${record.query}`;
              const isSelected = selectedTraces.some(t => t.conversationId === traceId);

              return (
                <div
                  key={idx}
                  onClick={() => !isSelected && handleAddTrace(record)}
                  className={`p-3 rounded-lg border cursor-pointer transition ${
                    isSelected
                      ? 'bg-black/5 border-black/20 cursor-default'
                      : 'bg-white border-black/10 hover:border-black/30 hover:bg-black/5'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="font-medium text-sm text-black">
                      Consumer {record.consumer_id}
                    </div>
                    <div className={`text-xs px-2 py-0.5 rounded ${
                      record.weighted_score >= 7 ? 'bg-green-100 text-green-700' :
                      record.weighted_score >= 5 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {record.weighted_score.toFixed(1)}
                    </div>
                  </div>
                  <div className="text-xs text-black/60 mb-1 line-clamp-2">
                    <strong>Q:</strong> {record.query}
                  </div>
                  <div className="text-xs text-black/60 mb-2 line-clamp-1">
                    <strong>R:</strong> {record.recommendation}
                  </div>
                  <div className="flex gap-2 text-xs">
                    <span className="text-black/40">{record.daypart}</span>
                    <span className="text-black/40">·</span>
                    <span className="text-black/40">Rel: {record.relevance_format_score}</span>
                    <span className="text-black/40">·</span>
                    <span className="text-black/40">Ser: {record.serendipity_score}</span>
                  </div>
                </div>
              );
            })}

            {filteredRecords.length === 0 && !dataLoading && (
              <div className="text-center py-8 text-black/40 text-sm">
                No traces found
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
