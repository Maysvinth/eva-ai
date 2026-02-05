
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { CHARACTERS, Character, Message } from './types';
import { Avatar } from './components/Avatar';
import { decodeBase64, decodeAudioData, createPcmBlob } from './geminiService';

const App: React.FC = () => {
  const [apiKey, setApiKey] = useState<string>(process.env.API_KEY || '');
  const [selectedCharacter, setSelectedCharacter] = useState<Character>(CHARACTERS[0]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'active' | 'error'>('idle');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [volume, setVolume] = useState(0);
  const [transcription, setTranscription] = useState({ input: '', output: '' });

  // Refs for audio handling
  const sessionRef = useRef<any>(null);
  const audioContextInRef = useRef<AudioContext | null>(null);
  const audioContextOutRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Initialize Audio Contexts
  const initAudio = async () => {
    if (!audioContextInRef.current) {
      audioContextInRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    }
    if (!audioContextOutRef.current) {
      audioContextOutRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      analyserRef.current = audioContextOutRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
    }
  };

  const handleAudioVolume = () => {
    if (!analyserRef.current) return;
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    const sum = dataArray.reduce((a, b) => a + b, 0);
    const avg = sum / dataArray.length;
    setVolume(avg / 128); // Normalize roughly
    requestAnimationFrame(handleAudioVolume);
  };

  const startSession = async () => {
    if (status === 'active') return;
    
    try {
      setStatus('connecting');
      await initAudio();
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedCharacter.voice } },
          },
          systemInstruction: selectedCharacter.instruction,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setStatus('active');
            handleAudioVolume();
            
            // Microphone streaming
            const source = audioContextInRef.current!.createMediaStreamSource(stream);
            const scriptProcessor = audioContextInRef.current!.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createPcmBlob(inputData);
              sessionPromise.then(session => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(audioContextInRef.current!.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Transcriptions
            if (message.serverContent?.inputTranscription) {
              setTranscription(prev => ({ ...prev, input: prev.input + message.serverContent?.inputTranscription?.text }));
            }
            if (message.serverContent?.outputTranscription) {
              setTranscription(prev => ({ ...prev, output: prev.output + message.serverContent?.outputTranscription?.text }));
            }
            if (message.serverContent?.turnComplete) {
              setMessages(prev => [
                ...prev,
                { role: 'user', text: transcription.input, timestamp: Date.now() },
                { role: 'model', text: transcription.output, timestamp: Date.now() }
              ]);
              setTranscription({ input: '', output: '' });
            }

            // Handle Audio Output
            const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData) {
              setIsSpeaking(true);
              const bytes = decodeBase64(audioData);
              const outCtx = audioContextOutRef.current!;
              
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outCtx.currentTime);
              const buffer = await decodeAudioData(bytes, outCtx, 24000, 1);
              const source = outCtx.createBufferSource();
              source.buffer = buffer;
              
              // Connect to analyser for volume detection
              source.connect(analyserRef.current!);
              analyserRef.current!.connect(outCtx.destination);
              
              source.onended = () => {
                sourcesRef.current.delete(source);
                if (sourcesRef.current.size === 0) setIsSpeaking(false);
              };
              
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
            }

            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => s.stop());
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setIsSpeaking(false);
            }
          },
          onerror: (e) => {
            console.error('Session error:', e);
            setStatus('error');
          },
          onclose: () => {
            setStatus('idle');
            setIsSpeaking(false);
          },
        },
      });

      sessionRef.current = await sessionPromise;
    } catch (err) {
      console.error('Failed to start session:', err);
      setStatus('error');
    }
  };

  const stopSession = () => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setStatus('idle');
    setVolume(0);
    setIsSpeaking(false);
  };

  // Re-run session if character changes while active
  useEffect(() => {
    if (status === 'active') {
      stopSession();
      startSession();
    }
  }, [selectedCharacter.id]);

  return (
    <div className="flex h-screen bg-black text-white overflow-hidden">
      {/* Sidebar - Characters */}
      <div className="w-20 md:w-64 glass flex flex-col p-4 space-y-4 border-r border-white/10 z-20">
        <div className="flex items-center space-x-2 mb-6 hidden md:flex">
          <div className="w-8 h-8 rounded-full bg-cyan-500 animate-pulse" />
          <h1 className="text-xl font-bold tracking-tighter">EVA CORE</h1>
        </div>
        
        {CHARACTERS.map((char) => (
          <button
            key={char.id}
            onClick={() => setSelectedCharacter(char)}
            className={`w-full p-3 rounded-xl transition-all duration-300 flex items-center space-x-3 group ${
              selectedCharacter.id === char.id 
                ? `bg-gradient-to-r ${char.color} text-white shadow-lg shadow-${char.accentColor}/20` 
                : 'hover:bg-white/5 text-gray-400'
            }`}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-black/20 group-hover:scale-110 transition-transform`}>
              {char.name[0]}
            </div>
            <span className="hidden md:block font-medium truncate">{char.name}</span>
          </button>
        ))}

        <div className="mt-auto hidden md:block">
          <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-xs text-gray-500">
            <p className="font-bold text-gray-400 mb-1">SYSTEM STATUS</p>
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${status === 'active' ? 'bg-green-500' : status === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'}`} />
              <span className="uppercase">{status}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 relative flex flex-col items-center justify-center p-6">
        {/* Background Animation */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-r from-cyan-500/30 to-blue-500/30 rounded-full blur-[120px] animate-pulse" />
        </div>

        {/* Avatar Display */}
        <div className="relative z-10 flex flex-col items-center transition-all duration-700">
          <Avatar 
            variant={selectedCharacter.avatarVariant} 
            color={selectedCharacter.accentColor} 
            isSpeaking={isSpeaking}
            volume={volume}
            isConnecting={status === 'connecting'}
          />
          
          <div className="mt-8 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white mb-2">{selectedCharacter.name}</h2>
            <p className="text-gray-400 text-sm max-w-md mx-auto h-12">
              {status === 'active' ? transcription.output || transcription.input || "Listening..." : "Waiting to initialize system protocols."}
            </p>
          </div>
        </div>

        {/* Chat History Overlay (Floating) */}
        <div className="absolute bottom-32 right-6 w-80 h-96 glass rounded-2xl p-4 overflow-y-auto scrollbar-hide hidden lg:block border border-white/10">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Memory Core</h3>
          <div className="space-y-4">
            {messages.length === 0 && (
              <p className="text-gray-600 italic text-sm">No recent interactions stored.</p>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[80%] p-2 rounded-lg text-xs ${msg.role === 'user' ? 'bg-white/10 text-white' : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'}`}>
                  {msg.text}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action Controls */}
        <div className="absolute bottom-10 flex items-center space-x-6 z-20">
          <button
            onClick={status === 'active' ? stopSession : startSession}
            disabled={status === 'connecting'}
            className={`group relative p-6 rounded-full transition-all duration-500 shadow-2xl ${
              status === 'active' 
                ? 'bg-red-500 hover:bg-red-600 scale-110' 
                : 'bg-white hover:bg-cyan-400'
            }`}
          >
            <div className={`absolute inset-0 rounded-full animate-ping opacity-25 ${status === 'active' ? 'bg-red-500' : 'bg-white'}`} />
            {status === 'active' ? (
              <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : (
              <svg className="w-8 h-8 text-black" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
              </svg>
            )}
          </button>
          
          <div className="flex flex-col text-xs font-mono text-gray-500">
             <span>HZ: {isSpeaking ? '24000' : '16000'}</span>
             <span>BIT: PCM_S16</span>
             <span>CH: MONO</span>
          </div>
        </div>
      </div>

      {/* Connection Toast */}
      {status === 'connecting' && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 glass px-6 py-3 rounded-full flex items-center space-x-3 z-50 border border-cyan-500/30">
          <div className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse" />
          <span className="text-sm font-medium text-cyan-400 tracking-wider">SYNCING WITH COGNITIVE ENGINE...</span>
        </div>
      )}
    </div>
  );
};

export default App;
