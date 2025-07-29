# 📊 Google Sheets Integration Setup

This guide explains how to set up and test the Google Sheets integration in your multi-domain authentication project.

## 🔧 Setup Steps

### 1. Enable Google Sheets API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to "APIs & Services" → "Library"
3. Search for "Google Sheets API"
4. Click "Enable"

### 2. Update OAuth Scopes

The backend is already configured with the correct scope:

```
https://www.googleapis.com/auth/spreadsheets
```

### 3. Verify OAuth Client Settings

Make sure your OAuth 2.0 Client ID in Google Cloud Console includes:

- **Authorized redirect URIs**: `https://your-backend-url.com/auth/google/callback`
- **Scopes**: The Sheets API scope is automatically included

## 🧪 Testing the Integration

### Frontend Features

After logging in, users will see:

- ✅ **"Create Google Sheet" button** (only if Google tokens are available)
- ✅ **Domain-specific sheet creation**
- ✅ **Automatic browser tab opening** to the new sheet

### What Happens When You Click "Create Google Sheet"

1. **API Call**: Frontend calls `/api/sheets/create`
2. **Authentication**: Backend verifies JWT and domain
3. **Sheet Creation**: New Google Sheet is created with:
   - Title: `{domain} - Data Sheet - {date}`
   - Sample data including domain and user info
4. **Response**: User gets success message and sheet opens

### Sample Sheet Content

The created sheet will contain:

```
| Domain    | User              | Created              |
|-----------|-------------------|----------------------|
| mpgd.ai   | user@gmail.com    | 2024-01-24T10:30:00Z |
| Sample    | Data              | Row                  |
```

## 🔍 Troubleshooting

### Common Issues

**"No Google access token available"**

- User needs to log out and log in again to get Sheets permissions
- Check that Google Sheets API is enabled in GCP

**"Failed to create Google Sheet"**

- Check backend logs for detailed error messages
- Verify the access token hasn't expired
- Ensure proper API permissions in Google Cloud Console

**Button not showing**

- Check browser console for errors
- Verify that `user.googleAccessToken` exists in the JWT
- Make sure you're logged in with the updated backend

### Backend Logs

Look for these log messages:

```bash
✅ Successfully authenticated user: user@email.com
📊 Creating Google Sheet for domain: example.com
✅ Sheet created: spreadsheet-id-here
```

### Testing Different Domains

1. **Deploy to multiple domains**
2. **Login on domain A** → Create sheet → Note the sheet title includes domain A
3. **Login on domain B** → Create sheet → Note the sheet title includes domain B
4. **Verify isolation**: Each domain creates separate sheets

## 🚀 Advanced Usage

### Custom Sheet Names

You can modify the frontend to allow custom sheet names:

```javascript
// Example: Add an input field for custom names
const handleCreateCustomSheet = () => {
  const sheetName = prompt("Enter sheet name:");
  if (sheetName) {
    handleCreateGoogleSheet(sheetName);
  }
};
```

### Additional Sheet Operations

The backend can be extended to support:

- **Reading data** from existing sheets
- **Updating cells** in existing sheets
- **Sharing sheets** with other users
- **Creating multiple worksheets** within a spreadsheet

### Example API Endpoints (Future)

```javascript
// Read sheet data
POST / api / sheets / read;
{
  token, domain, spreadsheetId, range;
}

// Update sheet data
POST / api / sheets / update;
{
  token, domain, spreadsheetId, range, values;
}

// List user's sheets
GET / api / sheets / list;
{
  token, domain;
}
```

## 🔐 Security Notes

- ✅ **Domain validation**: Sheets are created only for the authenticated domain
- ✅ **Token verification**: JWT tokens are validated before API calls
- ✅ **Scope limitation**: Only spreadsheet creation/editing permissions
- ✅ **Access isolation**: Each domain's tokens are separate

## 📈 Production Considerations

### Token Refresh

Consider implementing token refresh logic for long-running sessions:

```javascript
// Backend: Add refresh token endpoint
app.post("/api/auth/refresh", async (req, res) => {
  // Use refresh_token to get new access_token
  // Update JWT with new tokens
});
```

### Rate Limiting

Google Sheets API has quotas:

- **100 requests per 100 seconds per user**
- **Read requests**: 300 per minute per project

### Error Handling

Implement proper error handling for:

- API quota exceeded
- Network timeouts
- Invalid spreadsheet IDs
- Permission denied errors

## ✅ Success Verification

You'll know it's working when:

1. ✅ Login shows Google Sheets button
2. ✅ Clicking button creates a new sheet
3. ✅ Sheet opens in new browser tab
4. ✅ Sheet contains domain-specific data
5. ✅ Different domains create separate sheets

## 🎉 Next Steps

- Customize sheet templates per domain
- Add data export/import functionality
- Implement collaborative features
- Create dashboard for managing multiple sheets

The Google Sheets integration proves that your multi-domain auth system can handle complex API integrations while maintaining domain isolation!
