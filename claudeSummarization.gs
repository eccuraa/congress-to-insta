// ----------------------
// CONFIG
// ----------------------
const ANTHROPIC_API_KEY = "API_KEY_HERE"; // Get from console.anthropic.com
const MODEL = "claude-sonnet-4-20250514"; // Claude Sonnet 4 (best balance of speed/quality)
// ----------------------
// CORE FUNCTION: Calls Claude API with DEBUG LOGGING
// ----------------------

function callClaude(promptText) {
  Logger.log("=== callClaude() START ===");
  Logger.log("Prompt received:\n" + promptText);

  const url = "https://api.anthropic.com/v1/messages";
  Logger.log("Request URL: " + url);

  const payload = {
    model: MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: promptText
      }
    ]
  };

  Logger.log("Payload JSON:\n" + JSON.stringify(payload, null, 2));

  const options = {
    method: "post",
    contentType: "application/json",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  let response;
  try {
    Logger.log("Sending request to Claude API...");
    response = UrlFetchApp.fetch(url, options);
    Logger.log("HTTP Response Code: " + response.getResponseCode());
  } catch (err) {
    Logger.log("❌ ERROR: UrlFetchApp.fetch() failed:");
    Logger.log(err.toString());
    return "(No summary generated - Fetch error)";
  }

  const raw = response.getContentText();
  Logger.log("Raw API Response:\n" + raw);

  let result;
  try {
    result = JSON.parse(raw);
  } catch (err) {
    Logger.log("❌ ERROR: JSON.parse() failed:");
    Logger.log(err.toString());
    return "(No summary generated - Invalid JSON)";
  }

  // Debug entire parsed result
  Logger.log("Parsed API Response:\n" + JSON.stringify(result, null, 2));

  // Check for API errors
  if (result.error) {
    Logger.log("❌ API ERROR DETECTED:");
    Logger.log("Error Type: " + result.error.type);
    Logger.log("Error Message: " + result.error.message);
    return `(API Error: ${result.error.message})`;
  }

  // Check for rate limit
  if (response.getResponseCode() === 429) {
    Logger.log("⚠️ RATE LIMIT HIT - Waiting 2 seconds...");
    Utilities.sleep(2000);
    return "(Rate limited - retry needed)";
  }

  // Extract text from Claude's response format
  if (!result.content || result.content.length === 0) {
    Logger.log("⚠️ No content array in response");
    Logger.log("Full result keys: " + Object.keys(result).join(", "));
    return "(No summary generated - No content)";
  }

  // Claude returns content as array of blocks
  const textBlocks = result.content.filter(block => block.type === "text");
  
  if (textBlocks.length === 0) {
    Logger.log("⚠️ No text blocks found in content");
    Logger.log("Content structure:\n" + JSON.stringify(result.content, null, 2));
    return "(No summary generated - No text blocks)";
  }

  const text = textBlocks.map(block => block.text).join("\n").trim();

  if (!text) {
    Logger.log("⚠️ Empty text after extraction");
    return "(No summary generated - Empty text)";
  }

  Logger.log("✅ Generated Summary:\n" + text);
  Logger.log("=== callClaude() END ===");

  return text;
}

// ------------------------------------------------------
// TEST FUNCTION - Run this directly to test API
// ------------------------------------------------------
function testClaudeAPI() {
  Logger.log("=== TESTING CLAUDE API ===");
  const testPrompt = "Say 'Hello, API is working!' in exactly 5 words.";
  const result = callClaude(testPrompt);
  Logger.log("Test Result: " + result);
  Logger.log("=== TEST COMPLETE ===");
}

// ------------------------------------------------------
// Usage in sheet: =CLAUDE_SUMMARY(B2, ROW())
// ------------------------------------------------------
function CLAUDE_SUMMARY(text, row) {
  Logger.log("=== CLAUDE_SUMMARY() START ===");
  Logger.log("Input text: " + text);
  Logger.log("Row: " + row);

  // Case: CRS says "No summary available"
  if (typeof text === "string" && text.trim().toLowerCase() === "no summary available") {
    Logger.log("Detected 'No summary available' – fetching law name from column A");
    const lawName = SpreadsheetApp.getActiveSheet().getRange(row, 1).getValue();
    Logger.log("Fetched lawName: " + lawName);
    text = lawName || "";
  }

  if (!text) {
    Logger.log("⚠️ Empty text after fallback. Returning blank.");
    return "";
  }

  Logger.log("Final text to summarize:\n" + text);

  // Build prompt - optimized for Claude
  const prompt =
    `I am managing an Instagram account for politically curious American teenagers and young adults (similar to the Dutch account @checkjestem).

I need you to act as my Editor. I will provide you with a "CRS Summary" of a bill from Congress.gov. Your goal is to rewrite that summary into a "Visual Summary" that will appear on an Instagram image.

**Constraints:**
1. **Length:** Maximum 250 characters (including spaces). Shorter is better.
2. **Audience:** Gen Z / Young Millennials. Use accessible, plain English. Avoid legalese (e.g., "pursuant to," "therein," "rescissions").
3. **Style:** Descriptive but catchy. Do not use phrases like "This bill will..." or "The purpose of this act is..." Start directly with the subject or the action.
4. **Content:** Focus on the *primary impact* or the *most controversial change*. Ask yourself: "What actually changes in the real world?"
5. **Context:** The real title of the bill is in the caption, so do not repeat the bill name.

**Tone & Logic Examples:**

**Input:** Laken Riley Act (CRS Summary about detaining non-U.S. nationals for theft...)
**Output:** States can sue federal government if they don't detain illegal immigrants who have committed theft-related crimes.

**Input:** Rescissions Act of 2025
**Output:** $9.4 billion allocated to USAID, U.S. Dept. of State, Corp. of Public Broadcasting, etc. revoked.

**Input:** GENIUS Act
**Output:** U.S. dollar-backed stablecoins are federally mandated to abide by new regulations and government oversight.

**Input:** SUPPORT Act
**Output:** 4 year renewal of HHS programs to fight addiction, prevent overdoses, and strengthen mental-health services.

**Current Task:**

Please write the Visual Summary for the following text:

'${text}'

Return ONLY the summary text, nothing else.`;

  Logger.log("Final Prompt Sent to Claude:\n" + prompt);

  // RETRY LOGIC for intermittent failures
  let summary = null;
  let attempts = 0;
  const maxAttempts = 2;

  while (attempts < maxAttempts && !summary) {
    attempts++;
    Logger.log(`Attempt ${attempts} of ${maxAttempts}`);
    
    const result = callClaude(prompt);
    
    // Check if we got a real response (not an error message)
    if (result && !result.startsWith("(")) {
      summary = result;
      break;
    }
    
    Logger.log(`Attempt ${attempts} failed: ${result}`);
    
    // If rate limited, wait longer
    if (result.includes("Rate limited")) {
      Logger.log("Waiting 3 seconds for rate limit...");
      Utilities.sleep(3000);
    } else if (attempts < maxAttempts) {
      Logger.log("Waiting 1 second before retry...");
      Utilities.sleep(1000);
    }
  }

  if (!summary) {
    Logger.log("❌ All attempts failed");
    summary = "(Unable to generate - see logs)";
  }

  Logger.log("Summary Returned:\n" + summary);
  Logger.log("=== CLAUDE_SUMMARY() END ===");
  return summary;
}

// ------------------------------------------------------
// LEGACY FUNCTION NAME (for backward compatibility)
// Usage in sheet: =GEMINI_SUMMARY(B2, ROW())
// ------------------------------------------------------
function GEMINI_SUMMARY(text, row) {
  return CLAUDE_SUMMARY(text, row);
}
