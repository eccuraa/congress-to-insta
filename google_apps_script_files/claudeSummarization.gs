// ============================================================
// claudeSummarization.gs — Calls Claude API to generate summaries
// Depends on: 0_Config.gs (ANTHROPIC_API_KEY, MODEL)
// ============================================================

// ============================================================
// CLASS: ClaudeClient
// Handles all HTTP communication with the Anthropic API
// ============================================================
class ClaudeClient {
  constructor(apiKey, model) {
    this.apiKey = apiKey;
    this.model = model;
    this._apiUrl = "https://api.anthropic.com/v1/messages";
  }

  call(promptText) {
    const options = {
      method: "post",
      contentType: "application/json",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      payload: JSON.stringify({
        model: this.model,
        max_tokens: 1024,
        messages: [{ role: "user", content: promptText }],
      }),
      muteHttpExceptions: true,
    };

    let response;
    try {
      response = UrlFetchApp.fetch(this._apiUrl, options);
    } catch (err) {
      Logger.log("UrlFetchApp.fetch() failed: " + err.toString());
      return { success: false, reason: "fetch_error" };
    }

    const statusCode = response.getResponseCode();

    if (statusCode === 429) {
      return { success: false, reason: "rate_limited" };
    }

    let result;
    try {
      result = JSON.parse(response.getContentText());
    } catch (err) {
      Logger.log("JSON.parse() failed: " + err.toString());
      return { success: false, reason: "invalid_json" };
    }

    if (result.error) {
      Logger.log(
        "API error — the prompt sent to Claude was empty or malformed. " +
        "This usually means CLAUDE_SUMMARY() was run manually rather than " +
        "as an in-cell Google Sheets function. Error detail: " + result.error.message
      );
      return { success: false, reason: "api_error", message: result.error.message };
    }

    const text = (result.content ?? [])
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!text) {
      Logger.log("No text content in response");
      return { success: false, reason: "no_content" };
    }

    return { success: true, text };
  }

  test() {
    Logger.log("=== TESTING CLAUDE API ===");
    const result = this.call("Say 'Hello, API is working!' in exactly 5 words.");
    Logger.log("Test Result: " + (result.success ? result.text : result.reason));
    Logger.log("=== TEST COMPLETE ===");
  }
}

// ============================================================
// CLASS: SummaryRetrier
// Wraps ClaudeClient with retry logic and backoff strategy
// ============================================================
class SummaryRetrier {
  constructor(client, maxAttempts = 3) {
    this.client = client;
    this.maxAttempts = maxAttempts;
  }

  _getWaitMs(reason) {
    return reason === "rate_limited" ? 3000 : 1000;
  }

  run(prompt) {
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      Logger.log(`Attempt ${attempt} of ${this.maxAttempts}`);
      const result = this.client.call(prompt);

      if (result.success) return result.text;

      Logger.log(`Attempt ${attempt} failed — reason: ${result.reason}`);

      if (attempt < this.maxAttempts) {
        const waitMs = this._getWaitMs(result.reason);
        Logger.log(`Waiting ${waitMs}ms before retry...`);
        Utilities.sleep(waitMs);
      }
    }

    Logger.log("❌ All attempts failed");
    return null;
  }
}

// ============================================================
// CLASS: PromptBuilder
// Constructs the Claude prompt from input text
// ============================================================
class PromptBuilder {
  build(text) {
    return `I am managing an Instagram account for politically curious American teenagers and young adults (similar to the Dutch account @checkjestem).

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
  }
}

// ============================================================
// CLASS: InputResolver
// Resolves the input text, falling back to law name if needed
// ============================================================
class InputResolver {
  resolve(text, row) {
    if (typeof text === "string" && text.trim().toLowerCase() === "no summary available") {
      Logger.log("Detected 'No summary available' — fetching law name from column A");
      const lawName = SpreadsheetApp
        .getActiveSheet()
        .getRange(row, SCRAPED_COL.lawName)
        .getValue();
      Logger.log("Fetched lawName: " + lawName);
      return lawName || "";
    }
    return text;
  }
}

// ============================================================
// CLASS: SummaryGenerator
// Orchestrates the full summary generation pipeline
// ============================================================
class SummaryGenerator {
  constructor() {
    this.client = new ClaudeClient(ANTHROPIC_API_KEY, MODEL);
    this.retrier = new SummaryRetrier(this.client);
    this.promptBuilder = new PromptBuilder();
    this.inputResolver = new InputResolver();
  }

  generate(rawText, row) {
    Logger.log("=== CLAUDE_SUMMARY() START ===");
    Logger.log("Input text: " + rawText);
    Logger.log("Row: " + row);

    const text = this.inputResolver.resolve(rawText, row);

    if (!text) {
      Logger.log("⚠️ Empty text after fallback. Returning blank.");
      return "";
    }

    Logger.log("Final text to summarize:\n" + text);

    const prompt = this.promptBuilder.build(text);
    Logger.log("Final Prompt Sent to Claude:\n" + prompt);

    const summary = this.retrier.run(prompt) ?? "(Unable to generate - see logs)";

    Logger.log("Summary Returned:\n" + summary);
    Logger.log("=== CLAUDE_SUMMARY() END ===");
    return summary;
  }
}

// ============================================================
// ENTRY POINTS
// ============================================================

// Usage in sheet: =CLAUDE_SUMMARY(B2, ROW())
function CLAUDE_SUMMARY(text, row) {
  return new SummaryGenerator().generate(text, row);
}

function testClaudeAPI() {
  new ClaudeClient(ANTHROPIC_API_KEY, MODEL).test();
}
