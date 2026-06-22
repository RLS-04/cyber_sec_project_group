/* ========================================
   GOOGLE APPS SCRIPT - BACKEND
   Deploy this as a Web App (Execute as: Me, Access: Anyone)
   ======================================== */

// Sheet names
const SHEET_NAME = 'Tasks';
const DRIVE_FOLDER_NAME = 'TaskHub Screenshots';

/**
 * Main entry point for web app requests
 */
function doGet(e) {
    const action = e.parameter.action;

    try {
        if (action === 'getTasks') {
            return jsonResponse(getTasks());
        }

        return jsonResponse({ error: 'Unknown action' }, 400);
    } catch (err) {
        return jsonResponse({ error: err.toString() }, 500);
    }
}

function doPost(e) {
    try {
        const data = JSON.parse(e.postData.contents);
        const action = data.action;

        if (action === 'submitTask') {
            return jsonResponse(submitTask(data.data));
        }

        if (action === 'uploadImage') {
            return jsonResponse(uploadImage(data.image, data.filename));
        }

        return jsonResponse({ error: 'Unknown action' }, 400);
    } catch (err) {
        return jsonResponse({ error: err.toString() }, 500);
    }
}

function doOptions() {
    return jsonResponse({ status: 'ok' });
}

/**
 * Helper: Return JSON response with CORS headers
 */
function jsonResponse(data, statusCode) {
    statusCode = statusCode || 200;
    return ContentService
        .createTextOutput(JSON.stringify(data))
        .setMimeType(ContentService.MimeType.JSON)
        .setHeaders({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
}

/**
 * Get or create the tasks spreadsheet
 */
function getSpreadsheet() {
    const files = DriveApp.getFilesByName('TaskHub Database');
    let spreadsheet;

    if (files.hasNext()) {
        spreadsheet = SpreadsheetApp.open(files.next());
    } else {
        spreadsheet = SpreadsheetApp.create('TaskHub Database');
        const sheet = spreadsheet.getActiveSheet();
        sheet.setName(SHEET_NAME);
        // Set headers
        sheet.getRange(1, 1, 1, 5).setValues([['Date', 'Username', 'Task', 'Screenshot URL', 'ID']]);
        sheet.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#4f46e5').setFontColor('white');
    }

    return spreadsheet;
}

/**
 * Get or create the screenshots folder
 */
function getScreenshotsFolder() {
    const folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
    if (folders.hasNext()) {
        return folders.next();
    }
    return DriveApp.createFolder(DRIVE_FOLDER_NAME);
}

/**
 * Submit a new task to the spreadsheet
 */
function submitTask(task) {
    const spreadsheet = getSpreadsheet();
    const sheet = spreadsheet.getSheetByName(SHEET_NAME);

    const row = [
        task.date,
        task.username,
        task.task,
        task.screenshot || '',
        task.id
    ];

    sheet.appendRow(row);

    return { success: true, message: 'Task saved to spreadsheet' };
}

/**
 * Get all tasks from the spreadsheet
 */
function getTasks() {
    const spreadsheet = getSpreadsheet();
    const sheet = spreadsheet.getSheetByName(SHEET_NAME);
    const data = sheet.getDataRange().getValues();

    // Skip header row
    const tasks = [];
    for (let i = 1; i < data.length; i++) {
        tasks.push({
            date: data[i][0],
            username: data[i][1],
            task: data[i][2],
            screenshot: data[i][3],
            id: data[i][4]
        });
    }

    return { success: true, tasks: tasks.reverse() }; // Newest first
}

/**
 * Upload image to Google Drive and return public URL
 */
function uploadImage(base64Image, filename) {
    try {
        // Remove data URL prefix
        const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
        const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), 'image/jpeg', filename);

        const folder = getScreenshotsFolder();
        const file = folder.createFile(blob);

        // Make file publicly viewable
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

        return { 
            success: true, 
            url: file.getDownloadUrl(),
            thumbnailUrl: file.getThumbnailUrl()
        };
    } catch (err) {
        return { success: false, error: err.toString() };
    }
}
