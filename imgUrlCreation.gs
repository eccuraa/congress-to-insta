// ===== CONFIGURATION =====
const CONFIG = {
  // Google Slides template ID (from URL)
  templateId: "SHEETS_ID",
  
  // Google Sheets ID (from URL) - leave empty if running from bound script
  spreadsheetId: "", // Optional: only needed if standalone script
  
  // ImgBB API Key - get from https://api.imgbb.com/
  imgbbApiKey: "API_KEY_HERE"
};

/**
 * ----------------------
 * LOOP OVER ALL ROWS
 * ----------------------
 * Checks each row in Scraped Data column A.
 * Skips empty rows or "No laws found".
 * Generates slide and uploads to ImgBB.
 * Stores URL in Post Components column C.
 */
function generateAllImgBBUrls() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const scrapedSheet = ss.getSheetByName("Scraped Data");
  const postsSheet = ss.getSheetByName("Post Components");

  const lastRow = scrapedSheet.getLastRow();

  for (let i = 2; i <= lastRow; i++) {
    const lawName = scrapedSheet.getRange(i, 1).getValue().toString().trim(); // Column A

    // Skip if empty or "No laws found"
    if (!lawName || lawName.toLowerCase() === "no laws found") continue;

    // Use CRS Summary (B) if available, otherwise fallback to Law Name
    const visualSummary = postsSheet.getRange(i, 2).getValue().toString().trim();
    const textToUse = (!visualSummary || visualSummary.toLowerCase() === "no summary available")
                      ? lawName
                      : visualSummary;

    try {
      Logger.log(`Processing row ${i}: "${textToUse}"`);

      // Create slide
      const slideId = createSlideWithText(textToUse);

      // Export slide to PNG
      const imageBlob = exportSlideAsImage(slideId, 0);

      // Upload to ImgBB
      const imageUrl = uploadToImgBB(imageBlob);

      // Save URL in Post Components column C
      postsSheet.getRange(i, 3).setValue(imageUrl);

      // Clean up temporary slide
      DriveApp.getFileById(slideId).setTrashed(true);

      Logger.log(`Row ${i} complete: ImgBB URL -> ${imageUrl}`);

      // Optional pause to avoid hitting API limits
      Utilities.sleep(500);

    } catch (error) {
      Logger.log(`ERROR on row ${i}: ${error.toString()}`);
    }
  }
}

/**
 * ----------------------
 * MAIN FUNCTION: Single row pipeline
 * ----------------------
 * (kept for reference/testing)
 */
function createAndUploadSlide() {
  try {
    Logger.log('=== Starting Pipeline ===');

    const postText = getTextFromSheet();
    Logger.log('Text from A2: ' + postText);

    const slideId = createSlideWithText(postText);
    Logger.log('Created slide with ID: ' + slideId);

    const imageBlob = exportSlideAsImage(slideId, 0);
    Logger.log('Exported slide as PNG image');

    const imageUrl = uploadToImgBB(imageBlob);
    Logger.log('✓ Success! ImgBB URL: ' + imageUrl);

    DriveApp.getFileById(slideId).setTrashed(true);
    Logger.log('Cleaned up temporary slide');

    Logger.log('=== Pipeline Complete ===');
    return imageUrl;

  } catch (error) {
    Logger.log('ERROR: ' + error.toString());
    throw error;
  }
}

/**
 * ----------------------
 * Get text from A2 (single-row version)
 * ----------------------
 */
function getTextFromSheet() {
  let sheet;

  try {
    sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  } catch (e) {
    if (!CONFIG.spreadsheetId) {
      throw new Error('Not running from spreadsheet and no spreadsheetId configured');
    }
    sheet = SpreadsheetApp.openById(CONFIG.spreadsheetId).getActiveSheet();
  }

  const sheetText = sheet.getRange('A2').getValue();

  if (!sheetText || sheetText.toString().trim() === '') {
    throw new Error('No text found in cell A2');
  }

  return sheetText.toString();
}

/**
 * ----------------------
 * Create slide from template
 * ----------------------
 */
function createSlideWithText(sheetText) {
  const templateFile = DriveApp.getFileById(CONFIG.templateId);
  const copy = templateFile.makeCopy('Temp_Slide_' + Date.now());
  const slideId = copy.getId();

  const presentation = SlidesApp.openById(slideId);
  const slides = presentation.getSlides();

  if (slides.length === 0) {
    throw new Error('Template has no slides');
  }

  const firstSlide = slides[0];
  firstSlide.replaceAllText('\[text\]', sheetText);

  presentation.saveAndClose();
  return slideId;
}

/**
 * ----------------------
 * Export slide as PNG
 * ----------------------
 */
function exportSlideAsImage(presentationId, slideIndex) {
  const presentation = SlidesApp.openById(presentationId);
  const slides = presentation.getSlides();

  if (slideIndex >= slides.length) {
    throw new Error(`Slide index ${slideIndex} out of range`);
  }

  const slide = slides[slideIndex];
  const slideObjectId = slide.getObjectId();

  const exportUrl = `https://docs.google.com/presentation/d/${presentationId}/export/png?id=${presentationId}&pageid=${slideObjectId}`;

  const options = {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(exportUrl, options);

  if (response.getResponseCode() !== 200) {
    throw new Error('Failed to export slide. Response: ' + response.getResponseCode());
  }

  return response.getBlob().setName('slide.png');
}

/**
 * ----------------------
 * Upload PNG to ImgBB
 * ----------------------
 */
function uploadToImgBB(imageBlob) {
  if (!CONFIG.imgbbApiKey || CONFIG.imgbbApiKey === 'YOUR_IMGBB_API_KEY_HERE') {
    throw new Error('ImgBB API key not configured');
  }

  const base64Image = Utilities.base64Encode(imageBlob.getBytes());

  const options = {
    method: 'post',
    payload: {
      key: CONFIG.imgbbApiKey,
      image: base64Image,
      name: 'slide-' + Date.now()
    },
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch('https://api.imgbb.com/1/upload', options);
  const responseCode = response.getResponseCode();
  const responseText = response.getContentText();

  if (responseCode !== 200) {
    throw new Error('ImgBB upload failed. Status: ' + responseCode + ', Response: ' + responseText);
  }

  const data = JSON.parse(responseText);

  if (!data.success) {
    throw new Error('ImgBB returned success=false: ' + responseText);
  }

  return data.data.url;
}
