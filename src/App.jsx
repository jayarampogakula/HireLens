import React, { useState, useRef, useEffect } from 'react';
import confetti from 'canvas-confetti';
import {
  Sparkles,
  Upload,
  FileText,
  X,
  AlertTriangle,
  Key,
  Check,
  Eye,
  EyeOff,
  Clipboard,
  RefreshCw,
  Trophy,
  Crown,
  Briefcase,
  GraduationCap,
  Award,
  DollarSign,
  Mail,
  User,
  AlertCircle
} from 'lucide-react';
import './App.css';

function App() {
  // Config States
  const [provider, setProvider] = useState('Google Gemini');
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [modelName, setModelName] = useState('');
  
  // Azure OpenAI States
  const [azureEndpoint, setAzureEndpoint] = useState('');
  const [azureDeployment, setAzureDeployment] = useState('');

  // JD States
  const [jdText, setJdText] = useState('');
  const [jdFile, setJdFile] = useState(null);
  const [jdDragging, setJdDragging] = useState(false);

  // Resume States
  const [resumes, setResumes] = useState([]);
  const [resumesDragging, setResumesDragging] = useState(false);

  // Analysis & Result States
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [errors, setErrors] = useState(null);
  
  // Tab States
  const [activeEmailTab, setActiveEmailTab] = useState('shortlist'); // shortlist, invite, rejection
  const [toast, setToast] = useState(null);
  const [copiedQuestionIdx, setCopiedQuestionIdx] = useState(null);

  // Refs for file triggers
  const jdFileInputRef = useRef(null);
  const resumeFileInputRef = useRef(null);

  // Toast Helper
  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3000);
  };

  // Drag and Drop handlers for Job Description
  const handleJdDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setJdDragging(true);
    } else if (e.type === 'dragleave') {
      setJdDragging(false);
    }
  };

  const handleJdDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setJdDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const ext = file.name.split('.').pop().toLowerCase();
      if (['pdf', 'docx', 'txt'].includes(ext)) {
        setJdFile(file);
        setJdText(''); // Clear text when file is uploaded
        showToast(`Job description "${file.name}" added successfully.`);
      } else {
        showToast('Invalid file format. Only PDF, DOCX, and TXT are supported.', 'error');
      }
    }
  };

  const handleJdFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setJdFile(file);
      setJdText('');
      showToast(`Job description "${file.name}" added successfully.`);
    }
  };

  const removeJdFile = () => {
    setJdFile(null);
    if (jdFileInputRef.current) jdFileInputRef.current.value = '';
  };

  // Drag and Drop handlers for Resumes
  const handleResumesDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setResumesDragging(true);
    } else if (e.type === 'dragleave') {
      setResumesDragging(false);
    }
  };

  const handleResumesDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setResumesDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addResumeFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleResumesSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      addResumeFiles(Array.from(e.target.files));
    }
  };

  const addResumeFiles = (filesList) => {
    const validFiles = [];
    let rejectedCount = 0;

    filesList.forEach(file => {
      const ext = file.name.split('.').pop().toLowerCase();
      if (['pdf', 'docx', 'txt'].includes(ext)) {
        validFiles.push(file);
      } else {
        rejectedCount++;
      }
    });

    if (rejectedCount > 0) {
      showToast(`${rejectedCount} file(s) ignored. Only PDF, DOCX, and TXT formats are accepted.`, 'error');
    }

    setResumes(prev => {
      const merged = [...prev, ...validFiles];
      if (merged.length > 5) {
        showToast('Maximum of 5 resumes allowed. Only the first 5 will be kept.', 'warning');
        return merged.slice(0, 5);
      }
      if (validFiles.length > 0) {
        showToast(`Added ${validFiles.length} resume(s).`);
      }
      return merged;
    });
  };

  const removeResumeFile = (index) => {
    setResumes(prev => prev.filter((_, idx) => idx !== index));
    if (resumeFileInputRef.current) resumeFileInputRef.current.value = '';
  };

  // Main Submit Analysis
  const handleAnalyze = async () => {
    // Validations
    if (!apiKey.trim()) {
      showToast('Please enter an API Key.', 'error');
      return;
    }
    if (provider === 'Azure OpenAI' && (!azureEndpoint.trim() || !azureDeployment.trim())) {
      showToast('Azure Endpoint and Deployment Name are required.', 'error');
      return;
    }
    if (!jdFile && !jdText.trim()) {
      showToast('Please provide a Job Description (paste text or upload file).', 'error');
      return;
    }
    if (resumes.length === 0) {
      showToast('Please upload at least one candidate resume.', 'error');
      return;
    }

    setIsAnalyzing(true);
    setCandidates([]);
    setErrors(null);

    const formData = new FormData();
    formData.append('provider', provider);
    formData.append('apiKey', apiKey);
    
    if (modelName) formData.append('modelName', modelName);
    if (provider === 'Azure OpenAI') {
      formData.append('azureEndpoint', azureEndpoint);
      formData.append('azureDeployment', azureDeployment);
    }

    if (jdFile) {
      formData.append('jdFile', jdFile);
    } else {
      formData.append('jdText', jdText);
    }

    resumes.forEach(file => {
      formData.append('resumes', file);
    });

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Server error during screening.');
      }

      setCandidates(data.candidates);
      setErrors(data.errors);
      setSelectedIdx(0);
      showToast('Candidates analyzed successfully!');

      // Check if there is a strongly recommended candidate, and throw confetti!
      const hasStrongRecommend = data.candidates.some(c => c.recommendation === 'Strongly Recommend');
      const highestScore = data.candidates[0]?.overall_score || 0;
      if (hasStrongRecommend || highestScore >= 90) {
        confetti({
          particleCount: 150,
          spread: 80,
          origin: { y: 0.6 }
        });
      }

    } catch (err) {
      console.error(err);
      showToast(err.message || 'Failed to screen candidates.', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCopyEmail = (text) => {
    navigator.clipboard.writeText(text);
    showToast('Email draft copied to clipboard!');
  };

  const handleCopyQuestion = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopiedQuestionIdx(idx);
    showToast('Interview question copied!');
    setTimeout(() => setCopiedQuestionIdx(null), 2000);
  };

  const handleCopyReport = (candidate) => {
    const reportText = `ATS EVALUATION REPORT: ${candidate.candidate_name}
=========================================
Recommendation: ${candidate.recommendation}
Overall Match Score: ${candidate.overall_score}/100
Skill Match Score: ${candidate.skill_match_score}/100
Experience Score: ${candidate.experience_score}/100
Education Score: ${candidate.education_score}/100

SUMMARY:
${candidate.summary}

KEY STRENGTHS:
${candidate.strengths.map(s => `- ${s}`).join('\n')}

WEAKNESSES:
${candidate.weaknesses.map(w => `- ${w}`).join('\n')}

MISSING SKILLS:
${candidate.missing_skills.map(m => `- ${m}`).join('\n')}

INTERVIEW QUESTIONS:
${candidate.interview_questions.map((q, idx) => `${idx + 1}. ${q}`).join('\n')}
`;
    navigator.clipboard.writeText(reportText);
    showToast('ATS Evaluation Report copied!');
  };

  // Auto-fill default model names in helper labels
  const getProviderDefaultModel = () => {
    switch (provider) {
      case 'OpenAI': return 'gpt-4o';
      case 'Azure OpenAI': return 'Custom Deployment';
      case 'Anthropic Claude': return 'claude-3-5-sonnet-20240620';
      case 'Google Gemini': return 'gemini-1.5-pro';
      case 'Groq': return 'llama3-70b-8192';
      case 'OpenRouter': return 'meta-llama/llama-3-70b-instruct';
      case 'Mistral': return 'mistral-large-latest';
      case 'DeepSeek': return 'deepseek-chat';
      default: return '';
    }
  };

  return (
    <div className="app-container">
      {/* Toast Alert */}
      {toast && (
        <div className={`toast-msg ${toast.type}`}>
          <AlertCircle size={18} />
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <header className="app-header">
        <div className="logo-section">
          <Sparkles className="logo-icon" size={32} />
          <h1 className="logo-text">Hirelense</h1>
          <span className="logo-badge logo-tag">ATS Engine</span>
        </div>
        <div className="subtitle">
          Advanced AI Candidate Screening & Analysis
        </div>
      </header>

      {/* Inputs Configuration */}
      <div className="main-grid">
        {/* Left Side: JD & API configurations */}
        <div className="panel-card">
          <div className="panel-title">
            <FileText size={20} className="logo-icon" />
            Job Description & AI Setup
          </div>

          {/* Job Description File upload or paste text */}
          <div className="form-group">
            <label className="form-label">
              <span>Paste Job Description Text</span>
              {jdFile && (
                <span className="file-size">File takes precedence</span>
              )}
            </label>

            {!jdFile ? (
              <textarea
                className="text-area"
                placeholder="Paste the core requirements, skills, and duties here..."
                value={jdText}
                onChange={(e) => setJdText(e.target.value)}
              />
            ) : (
              <div className="file-item" style={{ height: '220px', flexDirection: 'column', justifyContent: 'center', gap: '15px' }}>
                <FileText size={48} className="logo-icon" />
                <div style={{ textAlign: 'center' }}>
                  <div className="file-name" style={{ maxWidth: '300px' }}>{jdFile.name}</div>
                  <div className="file-size">{(jdFile.size / 1024).toFixed(1)} KB</div>
                </div>
                <button className="btn-secondary" onClick={removeJdFile}>
                  <X size={14} /> Remove and edit text
                </button>
              </div>
            )}
          </div>

          <div
            className={`upload-zone ${jdDragging ? 'dragging' : ''}`}
            onDragOver={handleJdDrag}
            onDragEnter={handleJdDrag}
            onDragLeave={handleJdDrag}
            onDrop={handleJdDrop}
            onClick={() => jdFileInputRef.current.click()}
            style={{ padding: '16px 20px' }}
          >
            <Upload size={20} className="upload-icon" />
            <span className="meta-desc">
              Or drag & drop / <strong>browse</strong> JD.pdf, .docx, .txt
            </span>
            <input
              type="file"
              ref={jdFileInputRef}
              onChange={handleJdFileSelect}
              accept=".pdf,.docx,.txt"
              style={{ display: 'none' }}
            />
          </div>

          {/* AI Settings */}
          <div className="form-group">
            <label className="form-label">AI Provider</label>
            <div className="form-input-wrapper">
              <Sparkles size={16} className="form-input-icon" />
              <select
                className="select-input"
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value);
                  setModelName(''); // reset to default for provider
                }}
              >
                <option value="Google Gemini">Google Gemini</option>
                <option value="OpenAI">OpenAI</option>
                <option value="Azure OpenAI">Azure OpenAI</option>
                <option value="Anthropic Claude">Anthropic Claude</option>
                <option value="Groq">Groq</option>
                <option value="OpenRouter">OpenRouter</option>
                <option value="Mistral">Mistral</option>
                <option value="DeepSeek">DeepSeek</option>
              </select>
            </div>
          </div>

          {/* Conditional Fields for Azure */}
          {provider === 'Azure OpenAI' && (
            <>
              <div className="form-group">
                <label className="form-label">Azure Endpoint</label>
                <input
                  type="text"
                  className="text-input"
                  style={{ paddingLeft: '14px' }}
                  placeholder="https://your-resource.openai.azure.com/"
                  value={azureEndpoint}
                  onChange={(e) => setAzureEndpoint(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Deployment Name</label>
                <input
                  type="text"
                  className="text-input"
                  style={{ paddingLeft: '14px' }}
                  placeholder="e.g. gpt-4o-deployment"
                  value={azureDeployment}
                  onChange={(e) => setAzureDeployment(e.target.value)}
                />
              </div>
            </>
          )}

          {/* API Key */}
          <div className="form-group">
            <label className="form-label">API Key</label>
            <div className="form-input-wrapper">
              <Key size={16} className="form-input-icon" />
              <input
                type={showApiKey ? 'text' : 'password'}
                className="text-input"
                placeholder={`Enter your ${provider} API Key`}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <button
                type="button"
                className="api-key-toggle"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Custom Model Override */}
          {provider !== 'Azure OpenAI' && (
            <div className="form-group">
              <label className="form-label">
                <span>Model Name (Optional)</span>
                <span className="file-size">Default: {getProviderDefaultModel()}</span>
              </label>
              <input
                type="text"
                className="text-input"
                style={{ paddingLeft: '14px' }}
                placeholder="e.g. customized-model-id"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Right Side: Resumes Drag & Drop */}
        <div className="panel-card" style={{ minHeight: '568px' }}>
          <div className="panel-title">
            <User size={20} className="logo-icon" />
            Upload Candidate Resumes
          </div>
          
          <div
            className={`upload-zone ${resumesDragging ? 'dragging' : ''}`}
            onDragOver={handleResumesDrag}
            onDragEnter={handleResumesDrag}
            onDragLeave={handleResumesDrag}
            onDrop={handleResumesDrop}
            onClick={() => resumeFileInputRef.current.click()}
            style={{ flexGrow: 1, justifyContent: 'center' }}
          >
            <Upload size={48} className="upload-icon" />
            <div style={{ fontWeight: 600, fontSize: '1.05rem' }}>Drag & Drop resumes here</div>
            <p className="meta-desc" style={{ maxWidth: '300px', margin: '0 auto' }}>
              Accepts PDF and Word (.docx) files. Upload up to <strong>5 resumes</strong> for parallel screening.
            </p>
            <input
              type="file"
              ref={resumeFileInputRef}
              onChange={handleResumesSelect}
              multiple
              accept=".pdf,.docx,.txt"
              style={{ display: 'none' }}
            />
          </div>

          {resumes.length > 0 && (
            <div className="form-group">
              <label className="form-label">Uploaded Resumes ({resumes.length}/5)</label>
              <div className="file-list">
                {resumes.map((file, idx) => (
                  <div key={idx} className="file-item">
                    <div className="file-info">
                      <FileText size={16} className="logo-icon" />
                      <span className="file-name">{file.name}</span>
                      <span className="file-size">({(file.size / 1024).toFixed(1)} KB)</span>
                    </div>
                    <button className="remove-file-btn" onClick={() => removeResumeFile(idx)}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            className="btn-primary"
            onClick={handleAnalyze}
            disabled={isAnalyzing || resumes.length === 0}
          >
            {isAnalyzing ? (
              <>
                <RefreshCw size={18} className="spinner" />
                Screening Candidates...
              </>
            ) : (
              <>
                <Sparkles size={18} />
                Analyze Candidates
              </>
            )}
          </button>

          {resumes.length > 2 && (
            <p className="meta-desc" style={{ fontSize: '0.75rem', textAlign: 'center', color: 'var(--amber)', marginTop: '-10px' }}>
              ⚠️ Vercel Free Plan execution timeout is 10s. If analyzing more than 2 candidates takes longer, try scanning in smaller batches or run locally.
            </p>
          )}
        </div>
      </div>

      {/* Loading Screen */}
      {isAnalyzing && (
        <div className="panel-card analyzer-loader-panel">
          <Sparkles size={64} className="loader-sparkles" />
          <div>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>Evaluating Candidates</h3>
            <p className="meta-desc" style={{ maxWidth: '400px' }}>
              We are parsing your files, cross-referencing experience timelines, evaluating skill matrices, and writing comprehensive summaries. This takes about 5-10 seconds.
            </p>
          </div>
          <div style={{ width: '100%', maxWidth: '300px', marginTop: '10px' }}>
            <div className="skeleton-row" style={{ height: '6px', borderRadius: '3px' }} />
          </div>
        </div>
      )}

      {/* Output / Results Container */}
      {!isAnalyzing && candidates.length > 0 && (
        <div className="results-section">
          {/* Top Panel: Ranking table & failures summary */}
          <div className="panel-card ranking-table-card">
            <div className="panel-title">
              <Trophy size={20} style={{ color: '#f59e0b' }} />
              Screened Candidates Ranking
            </div>

            <div className="modern-table-container">
              <table className="modern-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Candidate</th>
                    <th>Recommendation</th>
                    <th>Overall Score</th>
                    <th>Skills Match</th>
                    <th>Experience</th>
                    <th>Education</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((cand, idx) => {
                    const isSelected = selectedIdx === idx;
                    const rec = cand.recommendation;
                    
                    let badgeClass = 'badge-consider';
                    if (rec === 'Strongly Recommend') badgeClass = 'badge-strongly-recommend';
                    else if (rec === 'Recommend') badgeClass = 'badge-recommend';
                    else if (rec === 'Not Recommended') badgeClass = 'badge-not-recommended';

                    return (
                      <tr
                        key={idx}
                        className={isSelected ? 'selected' : ''}
                        onClick={() => setSelectedIdx(idx)}
                      >
                        <td>
                          <div className="rank-cell">
                            {idx === 0 && <Crown size={16} className="rank-crown" style={{ color: '#f59e0b' }} />}
                            {idx === 1 && <Crown size={16} className="rank-crown" style={{ color: '#9ca3af' }} />}
                            {idx === 2 && <Crown size={16} className="rank-crown" style={{ color: '#b45309' }} />}
                            {idx + 1}
                          </div>
                        </td>
                        <td>
                          <div className="candidate-info-cell">
                            <span className="cand-name">{cand.candidate_name}</span>
                          </div>
                        </td>
                        <td>
                          <span className={`badge ${badgeClass}`}>{rec}</span>
                        </td>
                        <td style={{ fontWeight: 700, color: 'white' }}>
                          {cand.overall_score}/100
                        </td>
                        <td>{cand.skill_match_score}/100</td>
                        <td>{cand.experience_score}/100</td>
                        <td>{cand.education_score}/100</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Display processing errors if any */}
            {errors && errors.length > 0 && (
              <div style={{ marginTop: '15px', padding: '12px', border: '1px solid rgba(244,63,94,0.2)', background: 'rgba(244,63,94,0.03)', borderRadius: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f43f5e', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  <AlertTriangle size={16} />
                  Failed to analyze some resumes:
                </div>
                <ul style={{ paddingLeft: '20px', fontSize: '0.8rem', color: 'var(--text-sub)' }}>
                  {errors.map((err, idx) => (
                    <li key={idx} style={{ marginBottom: '4px' }}>
                      <strong>{err.fileName}</strong>: {err.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Bottom Panel: Detail dashboard of selected candidate */}
          {candidates[selectedIdx] && (
            <div className="detail-layout">
              {/* Sidebar: Overall Score ring & key assessments */}
              <div className="detail-sidebar">
                {/* Score gauge card */}
                <div className="panel-card" style={{ alignItems: 'center', padding: '30px 20px' }}>
                  <div className="score-circle-wrapper">
                    <svg className="score-svg" width="120" height="120">
                      <circle
                        className="score-circle-bg"
                        cx="60"
                        cy="60"
                        r="45"
                        strokeWidth="10"
                      />
                      <circle
                        className="score-circle-fill"
                        cx="60"
                        cy="60"
                        r="45"
                        strokeWidth="10"
                        strokeDashoffset={282.7 - (282.7 * candidates[selectedIdx].overall_score) / 100}
                        style={{
                          stroke: candidates[selectedIdx].overall_score >= 80 ? 'var(--emerald)' : candidates[selectedIdx].overall_score >= 60 ? 'var(--amber)' : 'var(--rose)'
                        }}
                      />
                    </svg>
                    <div className="score-text">
                      <span>{candidates[selectedIdx].overall_score}</span>
                      <span className="score-label">MATCH SCORE</span>
                    </div>
                  </div>

                  <div style={{ textAlign: 'center', marginTop: '10px' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'white' }}>
                      {candidates[selectedIdx].candidate_name}
                    </h2>
                    <div style={{ marginTop: '8px' }}>
                      <span className={`badge ${
                        candidates[selectedIdx].recommendation === 'Strongly Recommend' ? 'badge-strongly-recommend' :
                        candidates[selectedIdx].recommendation === 'Recommend' ? 'badge-recommend' :
                        candidates[selectedIdx].recommendation === 'Consider' ? 'badge-consider' : 'badge-not-recommended'
                      }`}>
                        {candidates[selectedIdx].recommendation}
                      </span>
                    </div>
                  </div>

                  {/* Sub scores breakdown */}
                  <div className="scores-summary-grid" style={{ width: '100%', marginTop: '20px' }}>
                    <div className="score-stat-card">
                      <div className="score-stat-num">{candidates[selectedIdx].skill_match_score}</div>
                      <div className="score-stat-name">SKILLS</div>
                    </div>
                    <div className="score-stat-card">
                      <div className="score-stat-num">{candidates[selectedIdx].experience_score}</div>
                      <div className="score-stat-name">EXP</div>
                    </div>
                    <div className="score-stat-card">
                      <div className="score-stat-num">{candidates[selectedIdx].education_score}</div>
                      <div className="score-stat-name">EDU</div>
                    </div>
                  </div>
                  
                  {candidates[selectedIdx].details?.interview_readiness_score && (
                    <div className="score-stat-card" style={{ width: '100%', marginTop: '10px', padding: '10px' }}>
                      <div className="score-stat-num" style={{ color: 'var(--primary)' }}>
                        {candidates[selectedIdx].details.interview_readiness_score}/100
                      </div>
                      <div className="score-stat-name">INTERVIEW READINESS</div>
                    </div>
                  )}

                  <button
                    className="btn-secondary"
                    style={{ width: '100%', marginTop: '15px' }}
                    onClick={() => handleCopyReport(candidates[selectedIdx])}
                  >
                    <Clipboard size={14} /> Copy ATS Evaluation Report
                  </button>
                </div>

                {/* Risks / Concerns card */}
                {candidates[selectedIdx].details?.risks && candidates[selectedIdx].details.risks.length > 0 && (
                  <div className="panel-card bullet-card bullet-card-concerns">
                    <div className="skills-column-title" style={{ color: 'var(--rose)' }}>
                      <AlertTriangle size={14} /> Risks Identified
                    </div>
                    <ul className="bullet-list">
                      {candidates[selectedIdx].details.risks.map((risk, i) => (
                        <li key={i} className="bullet-item">{risk}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Main Content Area */}
              <div className="detail-main">
                {/* Executive Summary */}
                <div className="panel-card">
                  <h3 className="section-subtitle">
                    <User size={16} /> Executive Candidate Summary
                  </h3>
                  <p className="meta-desc" style={{ fontSize: '0.9rem', lineHeight: '1.6', color: '#e5e7eb' }}>
                    {candidates[selectedIdx].summary}
                  </p>
                </div>

                {/* Skills Analysis */}
                <div className="panel-card">
                  <h3 className="section-subtitle">
                    <Sparkles size={16} /> Skill Match Analysis
                  </h3>
                  <div className="skills-analysis-grid">
                    {/* Required Skills */}
                    {candidates[selectedIdx].details?.skills?.required && (
                      <div className="skills-column-card">
                        <div className="skills-column-title" style={{ color: 'var(--emerald)' }}>
                          Required Skills
                        </div>
                        <div className="skills-list">
                          {candidates[selectedIdx].details.skills.required.map((skill, i) => (
                            <span key={i} className="skill-tag skill-tag-matched">{skill}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Preferred Skills */}
                    {candidates[selectedIdx].details?.skills?.preferred && (
                      <div className="skills-column-card">
                        <div className="skills-column-title" style={{ color: 'var(--blue)' }}>
                          Preferred Skills
                        </div>
                        <div className="skills-list">
                          {candidates[selectedIdx].details.skills.preferred.map((skill, i) => (
                            <span key={i} className="skill-tag skill-tag-preferred">{skill}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Missing Skills */}
                    {candidates[selectedIdx].details?.skills?.missing && (
                      <div className="skills-column-card">
                        <div className="skills-column-title" style={{ color: 'var(--rose)' }}>
                          Missing Skills
                        </div>
                        <div className="skills-list">
                          {candidates[selectedIdx].details.skills.missing.map((skill, i) => (
                            <span key={i} className="skill-tag skill-tag-missing">{skill}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Additional Skills */}
                    {candidates[selectedIdx].details?.skills?.additional && (
                      <div className="skills-column-card">
                        <div className="skills-column-title" style={{ color: '#a5b4fc' }}>
                          Additional Skills
                        </div>
                        <div className="skills-list">
                          {candidates[selectedIdx].details.skills.additional.map((skill, i) => (
                            <span key={i} className="skill-tag skill-tag-additional">{skill}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Experience Fit */}
                <div className="panel-card">
                  <h3 className="section-subtitle">
                    <Briefcase size={16} /> Experience Fit Analysis
                  </h3>
                  
                  {candidates[selectedIdx].details?.experience && (
                    <div>
                      <div className="exp-years-block">
                        <div className="exp-badge-stat">
                          <span className="exp-years-num">
                            {candidates[selectedIdx].details.experience.total_years}
                          </span>
                          <span className="exp-years-label">TOTAL YEARS</span>
                        </div>
                        <div className="exp-badge-stat">
                          <span className="exp-years-num" style={{ color: 'var(--primary)' }}>
                            {candidates[selectedIdx].details.experience.relevant_years}
                          </span>
                          <span className="exp-years-label">RELEVANT YEARS</span>
                        </div>
                      </div>

                      {candidates[selectedIdx].details.experience.industry_fit && (
                        <div style={{ marginBottom: '14px' }}>
                          <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-sub)', marginBottom: '4px' }}>
                            Industry Fit
                          </h4>
                          <p className="meta-desc" style={{ fontSize: '0.85rem' }}>
                            {candidates[selectedIdx].details.experience.industry_fit}
                          </p>
                        </div>
                      )}

                      {candidates[selectedIdx].details.experience.role_fit && (
                        <div>
                          <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-sub)', marginBottom: '4px' }}>
                            Role Fit
                          </h4>
                          <p className="meta-desc" style={{ fontSize: '0.85rem' }}>
                            {candidates[selectedIdx].details.experience.role_fit}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Strengths & Weaknesses */}
                <div className="dual-column-grid">
                  <div className="panel-card bullet-card bullet-card-strengths">
                    <h3 className="section-subtitle" style={{ color: 'var(--emerald)' }}>
                      Key Strengths
                    </h3>
                    <ul className="bullet-list">
                      {candidates[selectedIdx].strengths.map((str, i) => (
                        <li key={i} className="bullet-item">{str}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="panel-card bullet-card bullet-card-concerns">
                    <h3 className="section-subtitle" style={{ color: 'var(--rose)' }}>
                      Weaknesses / Concerns
                    </h3>
                    <ul className="bullet-list">
                      {candidates[selectedIdx].weaknesses.map((weak, i) => (
                        <li key={i} className="bullet-item">{weak}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Education, Certs, Salary */}
                <div className="panel-card">
                  <h3 className="section-subtitle">
                    <GraduationCap size={16} /> Education, Certifications & Comp Justification
                  </h3>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div>
                      {/* Education */}
                      <div style={{ marginBottom: '16px' }}>
                        <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-sub)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                          <GraduationCap size={14} /> Education Analysis
                        </h4>
                        <p className="meta-desc" style={{ fontSize: '0.85rem' }}>
                          {candidates[selectedIdx].details?.education || 'N/A'}
                        </p>
                      </div>

                      {/* Certifications */}
                      <div>
                        <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-sub)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                          <Award size={14} /> Certifications
                        </h4>
                        {candidates[selectedIdx].details?.certifications && candidates[selectedIdx].details.certifications.length > 0 ? (
                          <div className="skills-list" style={{ marginTop: '4px' }}>
                            {candidates[selectedIdx].details.certifications.map((cert, i) => (
                              <span key={i} className="skill-tag" style={{ background: 'rgba(255,255,255,0.05)', color: 'white', borderColor: 'var(--border)' }}>
                                {cert}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="meta-desc" style={{ fontSize: '0.85rem' }}>No formal certifications detected.</p>
                        )}
                      </div>
                    </div>

                    {/* Salary justification */}
                    <div>
                      <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-sub)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                        <DollarSign size={14} /> Salary Justification
                      </h4>
                      <p className="meta-desc" style={{ fontSize: '0.85rem', lineHeight: '1.5' }}>
                        {candidates[selectedIdx].details?.salary_justification || 'Salary estimation unavailable.'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 10 Personalized Interview Questions */}
                <div className="panel-card">
                  <h3 className="section-subtitle">
                    <Sparkles size={16} /> 10 Custom Interview Questions
                  </h3>
                  <div className="questions-list">
                    {candidates[selectedIdx].interview_questions.map((q, idx) => (
                      <div key={idx} className="question-card">
                        <div className="question-text-content">
                          <span className="question-number">{idx + 1}</span>
                          <span style={{ color: '#e5e7eb' }}>{q}</span>
                        </div>
                        <button
                          className={`copy-icon-btn ${copiedQuestionIdx === idx ? 'copied' : ''}`}
                          onClick={() => handleCopyQuestion(q, idx)}
                          title="Copy Question"
                        >
                          <Clipboard size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Additional Feature: Email Generator */}
                <div className="email-gen-card">
                  <div className="email-tabs-header">
                    <button
                      className={`email-tab ${activeEmailTab === 'shortlist' ? 'active' : ''}`}
                      onClick={() => setActiveEmailTab('shortlist')}
                    >
                      <Mail size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                      Shortlist Email
                    </button>
                    <button
                      className={`email-tab ${activeEmailTab === 'invite' ? 'active' : ''}`}
                      onClick={() => setActiveEmailTab('invite')}
                    >
                      <Mail size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                      Interview Invitation
                    </button>
                    <button
                      className={`email-tab ${activeEmailTab === 'rejection' ? 'active' : ''}`}
                      onClick={() => setActiveEmailTab('rejection')}
                    >
                      <Mail size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                      Rejection Email
                    </button>
                  </div>

                  <div className="email-body-wrapper">
                    {candidates[selectedIdx].emails && (
                      <>
                        <textarea
                          className="email-textarea"
                          readOnly
                          value={
                            activeEmailTab === 'shortlist' ? candidates[selectedIdx].emails.shortlist :
                            activeEmailTab === 'invite' ? candidates[selectedIdx].emails.interview_invitation :
                            candidates[selectedIdx].emails.rejection
                          }
                        />
                        <div className="email-actions-row">
                          <button
                            className="btn-primary"
                            style={{ width: 'auto' }}
                            onClick={() => handleCopyEmail(
                              activeEmailTab === 'shortlist' ? candidates[selectedIdx].emails.shortlist :
                              activeEmailTab === 'invite' ? candidates[selectedIdx].emails.interview_invitation :
                              candidates[selectedIdx].emails.rejection
                            )}
                          >
                            <Clipboard size={16} /> Copy Email Draft
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
