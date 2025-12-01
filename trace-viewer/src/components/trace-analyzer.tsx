"use client";

import { useState, useEffect, useRef } from 'react';
import { Search, Send, Loader2, Upload, AlertCircle, Bot, User } from 'lucide-react';
import Papa from 'papaparse';
import type { TraceRecord, GradingData, FuzzyGradingData } from '@/lib/trace-utils';
import { buildTraceRecords } from '@/lib/trace-utils';
import type { GradeRecord } from '@/lib/grade-types';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  traceRefs?: string[];
}

interface TraceReference {
  conversationId: string;
  traceIndex?: number;
  data: TraceRecord;
}

export default function TraceAnalyzer() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [traces, setTraces] = useState<TraceRecord[]>([]);
  const [gradeData, setGradeData] = useState<GradeRecord[]>([]);
  const [selectedTraces, setSelectedTraces] = useState<TraceReference[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showTracePicker, setShowTracePicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load trace and grade data
  useEffect(() => {
    loadGradeData();
  }, []);

  const loadGradeData = async () => {
    try {
      const response = await fetch('/data.csv');
      const text = await response.text();
      Papa.parse<GradeRecord>(text, {
        header: true,
        dynamicTyping: true,
        complete: (results) => {
          setGradeData(results.data.filter((row) => row.consumer_id));
        },
      });
    } catch (error) {
      console.error('Error loading grade data:', error);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      dynamicTyping: false,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const records = buildTraceRecords(results.data as any);
          setTraces(records);
        } catch (error) {
          console.error('Error parsing traces:', error);
        }
      },
    });
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
      traceRefs: selectedTraces.map(t => t.conversationId),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Build trace context from selected traces
      const traceContext = selectedTraces.map(ref => {
        const trace = ref.data;
        const relatedGrades = gradeData.filter(
          g => g.consumer_id.toString() === trace.consumer_id
        );

        return {
          conversation_id: trace.conversation_id,
          consumer_id: trace.consumer_id,
          trace_count: trace.trace_count,
          traces: trace.traces.map(t => ({
            query: t.query,
            rewrites: t.rewrites,
            stores: t.stores.map(s => ({
              store_name: s.store_name,
              business_id: s.business_id,
              cuisine: s.cuisine,
              grading: s.grading,
            })),
          })),
          related_grades: relatedGrades,
        };
      });

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
        content: 'Sorry, I encountered an error processing your request.',
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddTrace = (trace: TraceRecord) => {
    const ref: TraceReference = {
      conversationId: trace.conversation_id,
      data: trace,
    };
    if (!selectedTraces.find(t => t.conversationId === trace.conversation_id)) {
      setSelectedTraces(prev => [...prev, ref]);
    }
    setShowTracePicker(false);
  };

  const handleRemoveTrace = (conversationId: string) => {
    setSelectedTraces(prev => prev.filter(t => t.conversationId !== conversationId));
  };

  const filteredTraces = traces.filter(trace =>
    trace.conversation_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    trace.consumer_id?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
                Trace Analysis Assistant
              </h3>
              <p className="text-black/50 max-w-md">
                Upload trace data, select traces to analyze, and ask questions about performance, grading, and recommendations.
              </p>
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
                    References: {message.traceRefs.join(', ')}
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

        {/* Selected Traces */}
        {selectedTraces.length > 0 && (
          <div className="px-6 py-3 border-t border-black/10 bg-black/5">
            <div className="text-xs font-medium text-black/50 mb-2">Context:</div>
            <div className="flex flex-wrap gap-2">
              {selectedTraces.map(trace => (
                <div
                  key={trace.conversationId}
                  className="inline-flex items-center gap-2 bg-white border border-black/10 rounded-md px-3 py-1.5 text-sm"
                >
                  <span className="font-medium">{trace.conversationId}</span>
                  <button
                    onClick={() => handleRemoveTrace(trace.conversationId)}
                    className="text-black/40 hover:text-black"
                  >
                    ×
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
              className="px-4 py-2 bg-black/5 hover:bg-black/10 border border-black/10 rounded-lg text-sm font-medium transition"
              title="Add trace context"
            >
              @ Add Trace
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="Ask about traces, grades, or recommendations..."
              className="flex-1 px-4 py-2 border border-black/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/20"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="px-6 py-2 bg-black text-white rounded-lg font-medium hover:bg-black/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Side Panel */}
      <div className="w-96 bg-white border border-black/10 rounded-lg overflow-hidden flex flex-col">
        <div className="p-4 border-b border-black/10">
          <h3 className="text-lg font-semibold text-black mb-3">Trace Data</h3>

          <label className="block">
            <div className="px-4 py-2.5 bg-black text-white rounded-lg font-medium hover:bg-black/90 transition text-center cursor-pointer">
              <Upload className="w-4 h-4 inline mr-2" />
              Upload Trace CSV
            </div>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>

          {traces.length > 0 && (
            <div className="mt-3 text-sm text-black/60">
              {traces.length} trace{traces.length !== 1 ? 's' : ''} loaded
            </div>
          )}
        </div>

        {traces.length > 0 && (
          <>
            <div className="p-4 border-b border-black/10">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-black/40" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search traces..."
                  className="w-full pl-10 pr-4 py-2 border border-black/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="p-4 space-y-2">
                {filteredTraces.map(trace => {
                  const isSelected = selectedTraces.some(
                    t => t.conversationId === trace.conversation_id
                  );

                  return (
                    <div
                      key={trace.conversation_id}
                      onClick={() => !isSelected && handleAddTrace(trace)}
                      className={`p-3 rounded-lg border cursor-pointer transition ${
                        isSelected
                          ? 'bg-black/5 border-black/20 cursor-default'
                          : 'bg-white border-black/10 hover:border-black/30 hover:bg-black/5'
                      }`}
                    >
                      <div className="font-medium text-sm text-black mb-1">
                        {trace.conversation_id}
                      </div>
                      <div className="text-xs text-black/50">
                        Consumer: {trace.consumer_id}
                      </div>
                      <div className="text-xs text-black/50">
                        Traces: {trace.trace_count}
                      </div>
                    </div>
                  );
                })}

                {filteredTraces.length === 0 && (
                  <div className="text-center py-8 text-black/40 text-sm">
                    No traces found
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {traces.length === 0 && (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center text-black/40 text-sm">
              <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
              Upload a trace CSV to get started
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
