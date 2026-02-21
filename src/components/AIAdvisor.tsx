import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useComplianceStore } from '@/store/useComplianceStore';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const QUICK_ACTIONS = [
  '📋 Review our compliance status',
  '💰 Summarize our financial health',
  '⚖️ What are our bylaws obligations this quarter?',
  '🏗 Create a maintenance case',
];

export default function AIAdvisor() {
  const { currentRole } = useAuthStore();
  const { board, insurance, legalDocuments, details: buildingDetails, address, name: buildingName } = useBuildingStore();
  const { workOrders, chartOfAccounts, generalLedger, getIncomeMetrics } = useFinancialStore();
  const { completions, filings } = useComplianceStore();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isBoard = currentRole === 'BOARD_MEMBER' || currentRole === 'PROPERTY_MANAGER';
  if (!isBoard) return null;

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(scrollToBottom, [messages, loading]);

  const toggleChat = () => {
    setOpen(!open);
    if (!open && messages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: `Welcome! I'm your HOA Compliance Advisor for **${buildingName || 'Sunny Acres Condominiums'}** in **${address.city}, ${address.state}**.

I can help you with:
• **Bylaws & governing document** questions
• **Local, state & federal compliance** guidance
• **Budget and financial** questions
• **Insurance and legal document** reviews
• **Create cases and work orders**

How can I help you today?`
      }]);
    }
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const getContext = () => {
    const activePolicies = insurance.filter(p => p.expires > new Date().toISOString().split('T')[0]);
    const metrics = getIncomeMetrics();
    const totalChecklist = 28;
    const completedChecklist = Object.values(completions).filter(Boolean).length;
    const healthIndex = Math.round((completedChecklist / totalChecklist) * 100);

    return `HOA CONTEXT:
Building: ${buildingName || 'Sunny Acres Condominiums'}
Address: ${address.street}, ${address.city}, ${address.state} ${address.zip}
Units: ${buildingDetails.totalUnits} total
Year Built: ${buildingDetails.yearBuilt}

GOVERNING DOCUMENTS:
${legalDocuments.map(d => `- ${d.name} (v${d.version}, status: ${d.status})`).join('\n')}

INSURANCE:
${activePolicies.map(p => `- ${p.type}: ${p.carrier}, Coverage: ${p.coverage}, Expires: ${p.expires}`).join('\n')}

BOARD MEMBERS: ${board.map(b => `${b.name} (${b.role})`).join(', ')}

BUDGET STATUS:
Monthly assessments collected: ${metrics.collectionRate}%
Total budgeted: $${metrics.totalBudgeted.toLocaleString()}
Total actual: $${metrics.totalActual.toLocaleString()}

WORK ORDERS: ${workOrders.length} total, ${workOrders.filter(w => w.status !== 'paid').length} open

COMPLIANCE HEALTH INDEX: ${healthIndex}/100
Regulatory Filings: ${filings.filter(f => f.status === 'pending').length} pending, ${filings.filter(f => f.status === 'filed').length} filed

CHART OF ACCOUNTS: ${chartOfAccounts.length} accounts
GENERAL LEDGER: ${generalLedger.length} entries`;
  };

  const sendMessage = async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput('');

    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: msg }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const systemPrompt = `You are the HOA Compliance Advisor for a condominium association. You help board members understand their governing documents, comply with local/state/federal law, and manage their building.

CRITICAL RULES:
1. You are NOT a lawyer. Every substantive response must end with a brief disclaimer that this is general guidance, not legal advice.
2. Reference specific bylaw sections, state statutes when applicable.
3. For the building's jurisdiction (${address.state}), reference the correct state condo act.
4. Be concise but thorough. Use **bold** for emphasis. Use line breaks for readability.
5. When unsure about current law, say so and recommend checking with counsel.
6. If the user asks you to navigate somewhere, tell them which module to visit.

${getContext()}`;

      const apiMessages = newMessages.map(m => ({ role: m.role, content: m.content }));

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: systemPrompt,
          messages: apiMessages,
        }),
      });

      const data = await response.json();
      let fullText = '';
      if (data.content) {
        fullText = data.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
      }
      if (!fullText) fullText = 'I apologize, I was unable to process that request. Please try rephrasing your question.';

      setMessages([...newMessages, { role: 'assistant', content: fullText }]);
    } catch (err: any) {
      setMessages([...newMessages, { role: 'assistant', content: `I encountered an error connecting to the AI service. Please try again.\n\nError: ${err.message}` }]);
    }

    setLoading(false);
  };

  const renderMarkdown = (text: string) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  };

  return (
    <>
      {/* FAB */}
      {!open && (
        <button
          onClick={toggleChat}
          className="fixed bottom-6 right-6 w-14 h-14 bg-accent-600 text-white rounded-full shadow-lg hover:bg-accent-700 hover:shadow-xl transition-all flex items-center justify-center z-50 group"
          title="AI Compliance Advisor"
        >
          <span className="text-2xl">⚖</span>
          <span className="absolute -top-10 right-0 bg-ink-900 text-white text-xs px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">AI Advisor</span>
        </button>
      )}

      {/* Chat Panel */}
      {open && (
        <div className="fixed bottom-6 right-6 w-[420px] max-h-[600px] bg-white rounded-2xl shadow-2xl border border-ink-200 flex flex-col z-50 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-ink-900 to-ink-800 text-white px-5 py-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <span className="text-xl">⚖</span>
              <div>
                <h3 className="font-display font-bold text-sm">Compliance Advisor</h3>
                <p className="text-xs text-ink-300">AI-powered guidance · Not legal advice</p>
              </div>
            </div>
            <button onClick={toggleChat} className="w-8 h-8 rounded-lg hover:bg-white hover:bg-opacity-10 flex items-center justify-center transition-colors text-lg">✕</button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0" style={{ maxHeight: '400px' }}>
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`${m.role === 'user' ? 'bg-accent-600 text-white' : 'bg-ink-50 text-ink-800 border border-ink-100'} rounded-2xl ${m.role === 'user' ? 'rounded-br-md' : 'rounded-bl-md'} px-4 py-2.5 max-w-[85%] text-sm leading-relaxed`}>
                  <div dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
                  {m.role === 'assistant' && i > 0 && (
                    <div className="mt-2 pt-2 border-t border-ink-100 text-[10px] text-ink-400 italic">
                      ⚖ General guidance based on governing documents and applicable codes. Not legal advice — consult a licensed attorney.
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-ink-50 border border-ink-100 rounded-2xl rounded-bl-md px-4 py-3 text-sm text-ink-400">
                  <span className="inline-flex gap-1">
                    <span className="w-2 h-2 bg-ink-300 rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
                    <span className="w-2 h-2 bg-ink-300 rounded-full animate-bounce" style={{ animationDelay: '.15s' }} />
                    <span className="w-2 h-2 bg-ink-300 rounded-full animate-bounce" style={{ animationDelay: '.3s' }} />
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Actions - show only at start */}
          {messages.length <= 1 && (
            <div className="px-4 pb-2 flex flex-wrap gap-1.5">
              {QUICK_ACTIONS.map((q, i) => (
                <button key={i} onClick={() => sendMessage(q.replace(/^[^\s]+\s/, ''))}
                  className="text-xs bg-mist-50 border border-ink-100 rounded-lg px-2.5 py-1.5 text-ink-600 hover:bg-accent-50 hover:border-accent-200 transition-colors">
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="border-t border-ink-100 p-3 flex gap-2 shrink-0">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
              placeholder="Ask about compliance, bylaws, finances..."
              className="flex-1 px-3 py-2 border border-ink-200 rounded-lg text-sm focus:outline-none focus:border-accent-400"
              disabled={loading}
            />
            <button
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              className="px-4 py-2 bg-ink-900 text-white rounded-lg text-sm font-medium hover:bg-ink-800 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </>
  );
}
