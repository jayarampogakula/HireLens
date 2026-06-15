import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Multer setup for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit per file
}).fields([
  { name: 'jdFile', maxCount: 1 },
  { name: 'resumes', maxCount: 5 }
]);

// Helper: Extract text from PDF
async function extractPdfText(buffer) {
  try {
    const data = await pdf(buffer);
    return data.text || '';
  } catch (error) {
    console.error('Error parsing PDF:', error);
    throw new Error('Failed to parse PDF file. Ensure it is not corrupted or password protected.');
  }
}

// Helper: Extract text from Word document (.docx)
async function extractDocxText(buffer) {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  } catch (error) {
    console.error('Error parsing Word doc:', error);
    throw new Error('Failed to parse Word (.docx) file. Ensure it is a valid OpenXML document.');
  }
}

// Helper: Parse any supported file (PDF, DOCX, TXT)
async function parseFile(file) {
  if (!file) return '';
  const filename = file.originalname.toLowerCase();
  
  if (filename.endsWith('.pdf') || file.mimetype === 'application/pdf') {
    return await extractPdfText(file.buffer);
  } else if (filename.endsWith('.docx') || file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return await extractDocxText(file.buffer);
  } else if (filename.endsWith('.txt') || file.mimetype === 'text/plain') {
    return file.buffer.toString('utf8');
  } else {
    throw new Error(`Unsupported file format for ${file.originalname}. Only PDF, DOCX, and TXT are supported.`);
  }
}

// Helper: Clean JSON string from LLM responses (stripping markdown)
function cleanJSONString(str) {
  let cleaned = str.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  return cleaned.trim();
}

// LLM fetch router
async function callLLM(provider, apiKey, systemPrompt, userPrompt, config = {}) {
  const model = config.modelName?.trim();
  
  switch (provider) {
    case 'OpenAI': {
      const targetModel = model || 'gpt-4o';
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: targetModel,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.1
        })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error.message || 'OpenAI API Error');
      return data.choices[0].message.content;
    }
    
    case 'Azure OpenAI': {
      const endpoint = config.azureEndpoint?.trim();
      const deployment = config.azureDeployment?.trim();
      if (!endpoint || !deployment) {
        throw new Error('Azure OpenAI Endpoint and Deployment Name are required.');
      }
      // Clean endpoint: remove trailing slashes
      const baseEndpoint = endpoint.replace(/\/+$/, '');
      const url = `${baseEndpoint}/openai/deployments/${deployment}/chat/completions?api-version=2024-02-15-preview`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.1
        })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error.message || 'Azure OpenAI API Error');
      return data.choices[0].message.content;
    }
    
    case 'Anthropic Claude': {
      const targetModel = model || 'claude-3-5-sonnet-20240620';
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: targetModel,
          max_tokens: 4000,
          system: systemPrompt,
          messages: [
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.1
        })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error.message || 'Anthropic API Error');
      return data.content[0].text;
    }
    
    case 'Google Gemini': {
      const targetModel = model || 'gemini-3.5-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: userPrompt }]
            }
          ],
          systemInstruction: {
            parts: [{ text: systemPrompt }]
          },
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1
          }
        })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error.message || 'Google Gemini API Error');
      return data.candidates[0].content.parts[0].text;
    }
    
    case 'Groq': {
      const targetModel = model || 'llama3-70b-8192';
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: targetModel,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.1
        })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error.message || 'Groq API Error');
      return data.choices[0].message.content;
    }
    
    case 'OpenRouter': {
      const targetModel = model || 'meta-llama/llama-3-70b-instruct';
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:5173',
          'X-Title': 'Hirelense'
        },
        body: JSON.stringify({
          model: targetModel,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.1
        })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error.message || 'OpenRouter API Error');
      return data.choices[0].message.content;
    }
    
    case 'Mistral': {
      const targetModel = model || 'mistral-large-latest';
      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: targetModel,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.1
        })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error.message || 'Mistral API Error');
      return data.choices[0].message.content;
    }
    
    case 'DeepSeek': {
      const targetModel = model || 'deepseek-chat';
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: targetModel,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.1
        })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error.message || 'DeepSeek API Error');
      return data.choices[0].message.content;
    }
    
    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}

// System Prompt Constructor
const SYSTEM_PROMPT = `You are a senior technical recruiter and hiring manager.
Your task is to compare a candidate resume against a job description and provide a comprehensive hiring assessment.

Analyze the candidate in the following areas:
1. Overall Match Score (0-100)
2. Skill Match Analysis (Required Skills, Preferred Skills, Missing Skills, Additional Valuable Skills)
3. Experience Analysis (Total Experience, Relevant Experience, Industry Fit, Role Fit)
4. Education Analysis
5. Certifications Analysis
6. Strengths
7. Weaknesses
8. Risks
9. Interview Readiness Score (0-100)
10. Salary Justification Analysis
11. Candidate Summary
12. Hiring Recommendation (Must be one of: "Strongly Recommend", "Recommend", "Consider", "Not Recommended")
13. Generate exactly 10 personalized interview questions based on gaps, weaknesses, and strengths.
14. Produce custom email drafts for rejection, shortlist, and interview invitation.

CRITICAL RULES:
- Be strictly objective and evidence-based.
- Never invent skills, certifications, or experience not found in the resume.
- Calculate the scores realistically based on matching requirements.
- Calculate the total and relevant years of experience strictly based on dates.
- Return output strictly in JSON format.

You MUST respond with a single valid JSON object following this exact structure:
{
  "candidate_name": "Candidate Name",
  "overall_score": 92,
  "skill_match_score": 90,
  "experience_score": 95,
  "education_score": 85,
  "strengths": ["Strength 1", "Strength 2", ...],
  "weaknesses": ["Weakness 1", "Weakness 2", ...],
  "missing_skills": ["Missing Skill 1", "Missing Skill 2", ...],
  "interview_questions": [
    "Question 1...",
    "Question 2...",
    ...
    "Question 10..."
  ],
  "recommendation": "Strongly Recommend | Recommend | Consider | Not Recommended",
  "summary": "Summary text here...",
  "details": {
    "skills": {
      "required": ["Skill A (Found)", ...],
      "preferred": ["Skill B (Found)", ...],
      "missing": ["Missing Skill A", ...],
      "additional": ["Additional Valued Skill A", ...]
    },
    "experience": {
      "total_years": 7,
      "relevant_years": 5,
      "industry_fit": "Industry fit analysis...",
      "role_fit": "Role fit analysis..."
    },
    "education": "Education analysis details...",
    "certifications": ["Cert 1", ...],
    "risks": ["Risk 1", ...],
    "interview_readiness_score": 90,
    "salary_justification": "Salary justification details..."
  },
  "emails": {
    "rejection": "Subject: Rejection Email - ...\\n\\nDear ...",
    "shortlist": "Subject: Shortlist Email - ...\\n\\nDear ...",
    "interview_invitation": "Subject: Interview Invitation - ...\\n\\nDear ..."
  }
}`;

// Endpoint: Process Analysis
app.post('/api/analyze', upload, async (req, res) => {
  try {
    const { provider, apiKey, jdText, modelName, azureEndpoint, azureDeployment } = req.body;
    
    if (!provider || !apiKey) {
      return res.status(400).json({ error: 'AI Provider and API Key are required.' });
    }

    // 1. Get JD text
    let finalJdText = jdText || '';
    if (req.files && req.files.jdFile && req.files.jdFile[0]) {
      finalJdText = await parseFile(req.files.jdFile[0]);
    }
    
    if (!finalJdText || finalJdText.trim() === '') {
      return res.status(400).json({ error: 'Please paste a Job Description or upload a JD document.' });
    }

    // 2. Get Resumes
    if (!req.files || !req.files.resumes || req.files.resumes.length === 0) {
      return res.status(400).json({ error: 'Please upload at least one candidate resume.' });
    }

    const resumeFiles = req.files.resumes;
    
    // 3. Process each resume in parallel
    const analysisPromises = resumeFiles.map(async (file, idx) => {
      try {
        const resumeText = await parseFile(file);
        
        // Construct User Prompt
        const userPrompt = `JOB DESCRIPTION:\n${finalJdText}\n\n=========================================\n\nCANDIDATE RESUME (Filename: ${file.originalname}):\n${resumeText}\n\nPerform the assessment and return the strict JSON structure.`;
        
        const llmResponse = await callLLM(provider, apiKey, SYSTEM_PROMPT, userPrompt, {
          modelName,
          azureEndpoint,
          azureDeployment
        });
        
        const cleanedJsonString = cleanJSONString(llmResponse);
        const parsedResult = JSON.parse(cleanedJsonString);
        
        // Ensure name is present, fallback to filename
        if (!parsedResult.candidate_name || parsedResult.candidate_name.trim() === '') {
          parsedResult.candidate_name = file.originalname.replace(/\.[^/.]+$/, "");
        }
        
        return {
          success: true,
          fileName: file.originalname,
          result: parsedResult
        };
      } catch (err) {
        console.error(`Error processing resume ${file.originalname}:`, err);
        return {
          success: false,
          fileName: file.originalname,
          error: err.message || 'Unknown processing error'
        };
      }
    });

    const results = await Promise.all(analysisPromises);
    
    // Split into successes and failures
    const successes = results.filter(r => r.success).map(r => r.result);
    const errors = results.filter(r => !r.success).map(r => ({ fileName: r.fileName, error: r.error }));

    if (successes.length === 0) {
      return res.status(500).json({
        error: 'Failed to analyze any of the uploaded resumes. See details below.',
        details: errors
      });
    }

    // Rank successes by overall score in descending order
    successes.sort((a, b) => b.overall_score - a.overall_score);

    res.json({
      success: true,
      candidates: successes,
      errors: errors.length > 0 ? errors : null
    });

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// Export app for serverless environments (like Vercel)
export default app;

// Start server locally if not in a serverless environment
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
  });
}
