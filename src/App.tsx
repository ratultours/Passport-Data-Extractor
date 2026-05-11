/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  Upload, 
  FileText, 
  Copy, 
  Check, 
  Loader2, 
  Image as ImageIcon, 
  X, 
  User, 
  Globe, 
  Calendar, 
  Hash, 
  MapPin, 
  Mail, 
  Phone,
  ArrowRight,
  History as HistoryIcon,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Initialize Gemini AI
// Note: process.env.GEMINI_API_KEY is injected by the platform.
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface ExtractedData {
  surname: string | null;
  givenName: string | null;
  gender: string | null;
  dob: string | null;
  nationality: string | null;
  passportNo: string | null;
  address: string | null;
  contactNo: string | null;
  email: string | null;
}

const FIELD_LABELS: Record<keyof ExtractedData, string> = {
  surname: "Surname",
  givenName: "Given Name",
  gender: "Gender",
  dob: "Date of Birth",
  nationality: "Nationality",
  passportNo: "Passport No",
  address: "Address",
  contactNo: "Contact No",
  email: "Email"
};

const FIELD_ICONS: Record<keyof ExtractedData, React.ReactNode> = {
  surname: <User className="w-4 h-4" />,
  givenName: <User className="w-4 h-4" />,
  gender: <User className="w-4 h-4" />,
  dob: <Calendar className="w-4 h-4" />,
  nationality: <Globe className="w-4 h-4" />,
  passportNo: <Hash className="w-4 h-4" />,
  address: <MapPin className="w-4 h-4" />,
  contactNo: <Phone className="w-4 h-4" />,
  email: <Mail className="w-4 h-4" />
};

const FIXED_EMAILS = ["hasnatmdnur@gmail.com", "ratultours4@gmail.com"];

interface HistoryItem {
  id: string;
  timestamp: number;
  data: ExtractedData;
}

export default function App() {
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load history from local storage
  React.useEffect(() => {
    const savedHistory = localStorage.getItem('passport_history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (err) {
        console.error("Failed to load history", err);
      }
    }
  }, []);

  const saveToHistory = (data: ExtractedData) => {
    const newItem: HistoryItem = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      data
    };
    const updatedHistory = [newItem, ...history].slice(0, 10); // Keep last 10
    setHistory(updatedHistory);
    localStorage.setItem('passport_history', JSON.stringify(updatedHistory));
  };

  const deleteHistoryItem = (id: string) => {
    const updatedHistory = history.filter(item => item.id !== id);
    setHistory(updatedHistory);
    localStorage.setItem('passport_history', JSON.stringify(updatedHistory));
  };

  const clearHistory = () => {
    if (window.confirm("Are you sure you want to clear all history?")) {
      setHistory([]);
      localStorage.removeItem('passport_history');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError("Please upload an image file (PNG, JPG).");
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Resize logic to speed up API processing
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 1200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        // Use a slightly lower quality for faster transmission
        const resizedImage = canvas.toDataURL('image/jpeg', 0.8);
        setImage(resizedImage);
        setExtractedData(null);
        extractData(resizedImage); // Automatically trigger extraction
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const extractData = async (passedImage?: string) => {
    const imgToProcess = passedImage || image;
    if (!imgToProcess) return;

    setLoading(true);
    setError(null);

    try {
      const base64Data = imgToProcess.split(',')[1];
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              {
                text: `Extract structured medical patient information from this passport document.
                
                IMAGE QUALITY HANDLING:
                - GLARE/EXPOSURE: If holographic glare, overexposure, or shadows obscure specific fields, look for corresponding data in the MRZ (Machine Readable Zone) at the bottom.
                - LOW CONTRAST: If text is faint, use context and known document patterns (e.g., citizenship codes) to resolve ambiguity.
                - BLUR: Prioritize the high-contrast MRZ characters (standardized B-monospaced font) which are designed to be legible even under poor conditions.
                
                EXTRACTION HIERARCHY:
                1. PRIMARY DATA (Name/Passport No/Nationality): Use the MRZ lines as the definitive source. Resolve visual '0' vs 'O', '1' vs 'I', '8' vs 'B' by checking check-digits or MRZ character placement.
                2. NAME SEPARATION: Use the '<<' delimiters in the MRZ to strictly separate Surnames from Given Names. Clean up any unintentional word repetitions.
                3. FORMATTING: 
                   - Surnames/Given Names: Sentence Case (e.g., 'DOE' -> 'Doe').
                   - Dates (DOB): 'DD-MMM-YYYY' (e.g., '15-Jan-1988').
                   - Gender: 'Male', 'Female', or 'Other'.
                   - Nationality: Expand 3-letter ISO codes (e.g., 'BGD' -> 'Bangladesh', 'USA' -> 'United States').
                
                Return a JSON object with these keys: surname, givenName, gender, dob, nationality, passportNo, address, contactNo, email.`
              },
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: base64Data
                }
              }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              surname: { type: Type.STRING },
              givenName: { type: Type.STRING },
              gender: { type: Type.STRING },
              dob: { type: Type.STRING },
              nationality: { type: Type.STRING },
              passportNo: { type: Type.STRING },
              address: { type: Type.STRING },
              contactNo: { type: Type.STRING },
              email: { type: Type.STRING }
            }
          }
        }
      });

      const text = response.text;
      if (text) {
        const data = JSON.parse(text) as ExtractedData;

        // Cleanup helper to remove accidental AI loops/repetitions
        const cleanRepetition = (str: string | null) => {
          if (!str) return str;
          const words = str.split(/\s+/);
          const uniqueWords: string[] = [];
          words.forEach(word => {
            if (uniqueWords[uniqueWords.length - 1] !== word) {
              uniqueWords.push(word);
            }
          });
          return uniqueWords.join(' ');
        };

        data.surname = cleanRepetition(data.surname);
        data.givenName = cleanRepetition(data.givenName);

        // Always set the fixed email as per user request
        data.email = FIXED_EMAILS[0];
        setExtractedData(data);
        saveToHistory(data);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to extract data. Please try a clearer photo.");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const reset = () => {
    setImage(null);
    setExtractedData(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="mb-8 text-center">
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center justify-center p-2 bg-brand-light rounded-2xl mb-4"
          >
            <FileText className="w-6 h-6 text-brand mr-2" />
            <span className="font-semibold text-brand uppercase tracking-wider text-xs">Medical Gap Filler AI</span>
          </motion.div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-800 mb-2">
            Passport Data Extractor
          </h1>
          <p className="text-slate-500 max-w-lg mx-auto">
            Upload a passport copy and we'll extract the information you need to fill your portal.
          </p>
        </header>

        <main className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Upload Section */}
          <section className="space-y-6">
            <div 
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              className={`relative border-2 border-dashed rounded-3xl p-2 transition-all duration-300 flex flex-col items-center justify-center h-[300px] w-full max-w-[432px] mx-auto overflow-hidden ${
                image ? 'border-brand bg-brand-light' : 'border-slate-200 bg-white hover:border-brand hover:bg-slate-50'
              }`}
            >
              <AnimatePresence mode="wait">
                {!image ? (
                  <motion.div 
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-center"
                  >
                    <div className="w-16 h-16 bg-brand-light text-brand rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <Upload className="w-8 h-8" />
                    </div>
                    <p className="text-slate-600 font-medium mb-1 px-4">Drag & drop passport image</p>
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="px-6 py-2 bg-brand text-white rounded-xl font-medium hover:opacity-90 transition-colors shadow-sm mt-3"
                    >
                      Select Photo
                    </button>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="preview"
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="w-full h-full relative"
                  >
                    <img 
                      src={image} 
                      alt="Passport Preview" 
                      className="w-full h-full object-contain" 
                    />
                    <button 
                      onClick={reset}
                      className="absolute top-2 right-2 p-2 bg-white/90 backdrop-blur-md rounded-full shadow-lg text-slate-600 hover:text-red-500 transition-colors z-20"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept="image/*" 
                className="hidden" 
              />
            </div>
            
            {error && (
              <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-sm font-medium border border-red-100 italic flex flex-col gap-3">
                <p>{error}</p>
                <button 
                  onClick={() => extractData()}
                  className="text-xs font-bold uppercase tracking-wider bg-red-100 hover:bg-red-200 px-4 py-2 rounded-lg transition-colors w-fit"
                >
                  Retry Extraction
                </button>
              </div>
            )}
          </section>

          {/* Results Section */}
          <section className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-100 min-h-[400px]">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                      <FileText className="w-5 h-5 text-brand" />
                      Extracted Information
                    </h2>
                    {extractedData && (
                      <button 
                        onClick={() => {
                          const allText = (Object.keys(FIELD_LABELS) as Array<keyof ExtractedData>)
                            .map(k => `${FIELD_LABELS[k]}: ${extractedData[k] || 'Not found'}`)
                            .join('\n');
                          copyToClipboard(allText, 'all');
                        }}
                        className="text-xs font-bold text-brand hover:opacity-80 flex items-center gap-1 bg-brand-light px-3 py-1.5 rounded-lg transition-colors"
                      >
                        {copiedField === 'all' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        Copy All
                      </button>
                    )}
                  </div>

            <AnimatePresence mode="wait">
              {loading ? (
                <motion.div 
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center py-20"
                >
                  <Loader2 className="w-10 h-10 text-brand animate-spin mb-4" />
                  <p className="text-slate-500 font-medium tracking-tight">Extracting passport details...</p>
                  <p className="text-slate-300 text-[10px] mt-1 font-bold uppercase tracking-widest">Powered by Gemini 3 Flash</p>
                </motion.div>
              ) : extractedData ? (
                <motion.div 
                  key="data"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-3"
                >
                  {(Object.keys(FIELD_LABELS) as Array<keyof ExtractedData>).map((key) => {
                    const val = extractedData[key];
                    const isAvailable = val !== null && val !== undefined && val !== '';
                    return (
                      <div key={key} className="group relative">
                        <div className={`p-4 rounded-2xl border transition-all ${isAvailable ? 'border-slate-100 hover:border-brand-muted hover:bg-brand-light' : 'border-slate-50 opacity-60 bg-slate-50/50'}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-start gap-3">
                              <div className="mt-1 text-zinc-400">
                                {FIELD_ICONS[key]}
                              </div>
                              <div>
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">{FIELD_LABELS[key]}</span>
                                <span className={`text-slate-700 font-medium ${!isAvailable ? 'italic' : ''}`}>
                                  {isAvailable ? val : 'Not found'}
                                </span>
                                {key === 'email' && (
                                  <div className="flex gap-2 mt-2">
                                    {FIXED_EMAILS.map(email => (
                                      <button
                                        key={email}
                                        onClick={() => {
                                          if (extractedData) {
                                            setExtractedData({ ...extractedData, email });
                                          }
                                        }}
                                        className={`text-[10px] px-2 py-1 rounded-md border transition-all font-bold ${
                                          val === email 
                                            ? 'bg-brand text-white border-brand' 
                                            : 'bg-white text-slate-400 border-slate-200 hover:border-brand hover:text-brand'
                                        }`}
                                      >
                                        {email.split('@')[0]}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                            {isAvailable && (
                              <button 
                                onClick={() => copyToClipboard(val, key)}
                                className={`p-2 rounded-xl transition-all ${
                                  copiedField === key ? 'bg-green-100 text-green-600' : 'bg-slate-50 text-slate-400 hover:bg-brand-light hover:text-brand'
                                }`}
                                title="Copy to clipboard"
                              >
                                {copiedField === key ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  
                  <div className="pt-4 border-t border-slate-100 mt-6">
                    {extractedData && (
                      <button 
                        onClick={() => {
                          const allText = (Object.keys(FIELD_LABELS) as Array<keyof ExtractedData>)
                            .map(k => `${FIELD_LABELS[k]}: ${extractedData[k] || 'Not found'}`)
                            .join('\n');
                          copyToClipboard(allText, 'all');
                        }}
                        className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all mb-4 ${
                          copiedField === 'all' 
                            ? 'bg-green-600 text-white' 
                            : 'bg-brand text-white hover:opacity-90 shadow-lg shadow-brand/20'
                        }`}
                      >
                        {copiedField === 'all' ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                        {copiedField === 'all' ? 'Copied Everything!' : 'Copy All Extracted Data'}
                      </button>
                    )}
                    <p className="text-[10px] text-zinc-400 uppercase font-black tracking-widest text-center px-4">
                      Check extracted data against physical passport for accuracy
                    </p>
                  </div>
                </motion.div>
              ) : (
                <motion.div 
                  key="placeholder"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center py-20 text-center opacity-30"
                >
                  <FileText className="w-16 h-16 mb-4" />
                  <p className="text-slate-500 font-medium tracking-tight">Auto-Extraction Ready</p>
                  <p className="text-slate-400 text-xs">Details appear here instantly after upload</p>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </main>

        {/* History Section */}
        {history.length > 0 && (
          <section className="mt-12 bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-100">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <HistoryIcon className="w-5 h-5 text-slate-400" />
                Recent Extractions
              </h2>
              <button 
                onClick={clearHistory}
                className="text-xs font-semibold text-red-500 hover:text-red-600 bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
              >
                Clear History
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {history.map((item) => (
                <motion.div 
                  key={item.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-4 rounded-2xl border border-slate-100 hover:border-brand-muted bg-slate-50/30 group transition-all"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-brand-light flex items-center justify-center text-brand">
                        <User className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800 truncate max-w-[120px]">
                          {item.data.givenName || 'Unnamed'}
                        </p>
                        <p className="text-[10px] text-slate-400 font-medium italic">
                          {new Date(item.timestamp).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <button 
                      onClick={() => deleteHistoryItem(item.id)}
                      className="p-1.5 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="space-y-1 mb-4">
                    <p className="text-xs text-slate-500 flex justify-between">
                      <span className="font-medium text-slate-400 uppercase tracking-tighter">Passport:</span>
                      <span className="font-mono">{item.data.passportNo || 'N/A'}</span>
                    </p>
                    <p className="text-xs text-slate-500 flex justify-between">
                      <span className="font-medium text-slate-400 uppercase tracking-tighter">Citizenship:</span>
                      <span>{item.data.nationality || 'N/A'}</span>
                    </p>
                  </div>

                  <button 
                    onClick={() => {
                      setExtractedData(item.data);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="w-full py-2 bg-white border border-slate-200 text-slate-600 font-semibold rounded-xl text-xs hover:bg-slate-900 hover:text-white transition-all shadow-sm"
                  >
                    Load this Data
                  </button>
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* Footer info */}
        <footer className="mt-12 text-center pb-8">
          <p className="text-slate-400 text-xs flex items-center justify-center gap-4">
            <span>Powered by Gemini 3 Flash</span>
            <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
            <span>Fast & Private Extraction</span>
          </p>
        </footer>
      </div>
    </div>
  );
}
