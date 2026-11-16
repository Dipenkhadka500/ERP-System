package com.birathealthcare.dipen.integration;

import com.birathealthcare.dipen.exception.ErpBusinessException;
import com.google.api.client.googleapis.javanet.GoogleNetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import com.google.api.services.sheets.v4.Sheets;
import com.google.api.services.sheets.v4.SheetsScopes;
import com.google.auth.http.HttpCredentialsAdapter;
import com.google.auth.oauth2.GoogleCredentials;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.FileInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

@Component
public class GoogleSheetsClientProvider {

  @Value("${dipen.google.credentials-path:}")
  private String credentialsPath;

  @Value("${dipen.google.application-name:DIPEN-SYSTEM-ERP}")
  private String applicationName;

  @Value("${dipen.google.operations-spreadsheet-id:1gGmpt4gKEE4Nu42960A8cmdrXaTpT-IKHW5oTAWGAJs}")
  private String operationsSpreadsheetId;

  @Value("${dipen.google.procurement-spreadsheet-id:16SN_MJjvmWqt_OH8Hol3AVGB6hWFTM_rYOG1FTi2-yY}")
  private String procurementSpreadsheetId;

  public boolean isConfigured() {
    return credentialsPath != null && !credentialsPath.isBlank() && Files.exists(Path.of(credentialsPath.trim()));
  }

  public String getOperationsSpreadsheetId() {
    return operationsSpreadsheetId;
  }

  public String getProcurementSpreadsheetId() {
    return procurementSpreadsheetId;
  }

  public Sheets createSheetsClient() {
    if (!isConfigured()) {
      throw new ErpBusinessException(
          "Google Sheets Service Account credentials file is not configured. Set DIPEN_GOOGLE_CREDENTIALS_PATH.",
          503
      );
    }
    try (FileInputStream fis = new FileInputStream(credentialsPath.trim())) {
      GoogleCredentials credentials = GoogleCredentials.fromStream(fis)
          .createScoped(List.of(SheetsScopes.SPREADSHEETS));
      return new Sheets.Builder(
          GoogleNetHttpTransport.newTrustedTransport(),
          GsonFactory.getDefaultInstance(),
          new HttpCredentialsAdapter(credentials)
      ).setApplicationName(applicationName).build();
    } catch (Exception ex) {
      throw new ErpBusinessException("Failed to initialize Google Sheets API client: " + ex.getMessage(), 502);
    }
  }
}
