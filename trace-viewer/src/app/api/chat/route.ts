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
      content: `You are a VOX Trace Analysis Assistant. You help analyze trace data, grading results, and query performance.

${traceContext ? `\n### Current Trace Context:\n${JSON.stringify(traceContext, null, 2)}` : ''}

Your job is to:
1. Analyze trace data and identify issues
2. Explain grading scores and what went wrong
3. Suggest improvements for query rewrites and recommendations
4. Help understand consumer behavior patterns

Be concise, technical, and actionable.`
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
