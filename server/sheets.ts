import { google } from 'googleapis';
import { writeQueue } from './queue.js';

/**
 * Google Sheets API Integration with Service Account credentials
 */

export class GoogleSheetsClient {
  private sheetsService: any = null;
  private driveService: any = null;
  private spreadsheetId: string = '';
  private driveFolderId: string = '';
  private isConfigured: boolean = false;

  constructor() {
    this.init();
  }

  private init() {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const rawKey = process.env.GOOGLE_PRIVATE_KEY;
    this.spreadsheetId = process.env.SPREADSHEET_ID || '';
    this.driveFolderId = process.env.DRIVE_FOLDER_ID || '';

    if (email && rawKey && this.spreadsheetId) {
      try {
        const privateKey = rawKey.replace(/\\n/g, '\n');
        const auth = new google.auth.JWT({
          email,
          key: privateKey,
          scopes: [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive',
          ],
        });

        this.sheetsService = google.sheets({ version: 'v4', auth });
        this.driveService = google.drive({ version: 'v3', auth });
        this.isConfigured = true;
        console.log('[GoogleSheetsClient] Initialized successfully with Service Account:', email);
      } catch (err) {
        console.error('[GoogleSheetsClient] Failed to initialize Google Auth:', err);
        this.isConfigured = false;
      }
    } else {
      this.isConfigured = false;
    }
  }

  get isConnected(): boolean {
    return this.isConfigured;
  }

  get sheetId(): string {
    return this.spreadsheetId;
  }

  /**
   * Read rows from a sheet
   */
  async readRows(sheetName: string): Promise<string[][]> {
    if (!this.isConfigured || !this.sheetsService) {
      throw new Error('Google Sheets not configured');
    }

    const response = await this.sheetsService.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!A:Z`,
    });

    return response.data.values || [];
  }

  /**
   * Append rows to a sheet with writeQueue
   */
  async appendRows(sheetName: string, rows: any[][]): Promise<void> {
    if (!this.isConfigured || !this.sheetsService) {
      throw new Error('Google Sheets not configured');
    }

    await writeQueue.enqueue(async () => {
      await this.sheetsService.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A1`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: rows,
        },
      });
    });
  }

  /**
   * Update full sheet values (batch update)
   */
  async updateSheet(sheetName: string, values: any[][]): Promise<void> {
    if (!this.isConfigured || !this.sheetsService) {
      throw new Error('Google Sheets not configured');
    }

    await writeQueue.enqueue(async () => {
      // Clear first then write
      await this.sheetsService.spreadsheets.values.clear({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A:Z`,
      });

      await this.sheetsService.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values,
        },
      });
    });
  }

  /**
   * Upload file to Google Drive folder
   */
  async uploadFileToDrive(fileName: string, mimeType: string, base64Data: string): Promise<string> {
    if (!this.isConfigured || !this.driveService) {
      throw new Error('Google Drive not configured');
    }

    const buffer = Buffer.from(base64Data, 'base64');
    const { Readable } = await import('stream');
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

    const fileMetadata: any = {
      name: fileName,
    };
    if (this.driveFolderId) {
      fileMetadata.parents = [this.driveFolderId];
    }

    const response = await this.driveService.files.create({
      requestBody: fileMetadata,
      media: {
        mimeType,
        body: stream,
      },
      fields: 'id, webViewLink, webContentLink',
    });

    const fileId = response.data.id;
    // Set permission to anyone with link can view
    try {
      await this.driveService.permissions.create({
        fileId,
        requestBody: {
          role: 'reader',
          type: 'anyone',
        },
      });
    } catch (e) {
      // Permission might already be inherited from folder
    }

    return `https://drive.google.com/uc?export=view&id=${fileId}`;
  }
}

export const googleSheetsClient = new GoogleSheetsClient();
