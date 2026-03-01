const CONFIG = {
  templateId: "1xhn0sgndIIoQT53elvLnpyebWzXsd027XN0EgsEVJRI",
  spreadsheetId: "",
  imgbbApiKey: "YOUR_IMGBB_API_KEY_HERE",
  cloudFunctionUrl: "https://us-central1-voting-plot-matplotlib.cloudfunctions.net/generate_arc_image"
};

function generateAllImgBBUrls() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const scrapedSheet = ss.getSheetByName("Scraped Data");
  const postsSheet = ss.getSheetByName("Post Components");
  const lastRow = scrapedSheet.getLastRow();

  for (let i = 2; i <= lastRow; i++) {
    const lawName = scrapedSheet.getRange(i, 1).getValue().toString().trim();
    if (!lawName || lawName.toLowerCase() === "no laws found") continue;

    const visualSummary = postsSheet.getRange(i, 2).getValue().toString().trim();
    const textToUse = (!visualSummary || visualSummary.toLowerCase() === "no summary available")
                      ? lawName : visualSummary;

    // Read voting percentages from Post Components columns C–G (cols 3–7)
    const sweepValues = {
      senate_ind_value: postsSheet.getRange(i, 3).getValue(),
      senate_dem_value: postsSheet.getRange(i, 4).getValue(),
      house_dem_value:  postsSheet.getRange(i, 5).getValue(),
      house_rep_value:  postsSheet.getRange(i, 6).getValue(),
      senate_rep_value: postsSheet.getRange(i, 7).getValue(),
    };

    try {
      Logger.log(`Processing row ${i}: "${textToUse}"`);

      const arcImageUrl = callPythonPlotter(sweepValues);
      const slideId = createSlideWithText(textToUse, arcImageUrl);
      const imageBlob = exportSlideAsImage(slideId, 0);
      const imageUrl = uploadToImgBB(imageBlob);

      postsSheet.getRange(i, 8).setValue(imageUrl);
      DriveApp.getFileById(slideId).setTrashed(true);
      Logger.log(`Row ${i} complete: ${imageUrl}`);

    } catch (error) {
      Logger.log(`ERROR on row ${i}: ${error.toString()}`);
    }
  }
}

/**
 * Calls Cloud Function with sweep values, returns ImgBB URL of the arc plot
 */
function callPythonPlotter(sweepValues) {
  const response = UrlFetchApp.fetch(CONFIG.cloudFunctionUrl, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(sweepValues),
    muteHttpExceptions: true
  });

  if (response.getResponseCode() !== 200) {
    throw new Error(`Cloud Function failed: ${response.getContentText()}`);
  }

  return JSON.parse(response.getContentText()).imageUrl;
}

/**
 * Create slide from template, insert arc image, replace text placeholder
 */
function createSlideWithText(sheetText, arcImageUrl) {
  const templateFile = DriveApp.getFileById(CONFIG.templateId);
  const copy = templateFile.makeCopy('Temp_Slide_' + Date.now());
  const slideId = copy.getId();

  const presentation = SlidesApp.openById(slideId);
  const slides = presentation.getSlides();

  if (slides.length === 0) throw new Error('Template has no slides');

  const firstSlide = slides[0];
  firstSlide.replaceAllText('\[text\]', sheetText);

  // Insert the arc plot image — adjust position/size to match your template layout
  firstSlide.insertImage(arcImageUrl)
    .setLeft(155).setTop(350).setWidth(400).setHeight(400);

  presentation.saveAndClose();
  return slideId;
}


/**
 * ----------------------
 * Export slide as PNG
 * ----------------------
 */
function exportSlideAsImage(presentationId, slideIndex) {
  // Redefine these local variables
  const presentation = SlidesApp.openById(presentationId);
  const slides = presentation.getSlides();

  if (slideIndex >= slides.length) {
    throw new Error(`Slide index ${slideIndex} out of range`);
  }

  const slide = slides[slideIndex];
  const slideObjectId = slide.getObjectId();

  // Make copied and filled in Google Slideshow link, ready for exporting and posting
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
 * Upload Slides PNG to ImgBB
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
