# 🔗 Airtable OAuth Integration Setup

This guide explains how to set up the OAuth-based Airtable integration, which provides a much smoother user experience compared to manual API key entry.

## 🆚 OAuth vs API Key Comparison

| Feature              | OAuth Integration         | API Key Integration |
| -------------------- | ------------------------- | ------------------- |
| **User Experience**  | One-click connect         | Manual token entry  |
| **Setup Required**   | OAuth app setup           | None                |
| **Security**         | Managed by OAuth          | User-provided keys  |
| **Token Management** | Automatic refresh         | Manual rotation     |
| **User sees**        | "Connect Airtable" button | API key form        |

## 🔧 Setup Steps

### 1. Create Airtable OAuth App

1. Go to [Airtable Developers](https://airtable.com/developers/web)
2. Click "Create new app"
3. Fill in app details:
   - **App name**: "Multi-Domain Auth Integration"
   - **App description**: "Centralized authentication with domain isolation"
   - **App category**: "Productivity"

### 2. Configure OAuth Settings

1. In your Airtable app dashboard, go to "OAuth" section
2. Configure these settings:

   - **Redirect URLs**: Add your backend callback URL:
     ```
     https://your-backend-url.com/auth/airtable/callback
     ```
   - **Scopes**: Select these permissions:
     - `data.records:read` - Read records from bases
     - `data.records:write` - Create records in bases
     - `schema.bases:read` - Read base schema information

3. Save your OAuth credentials:
   - **Client ID**: Copy this to your backend `.env`
   - **Client Secret**: Copy this to your backend `.env`

### 3. Update Backend Environment

Add to your backend `.env` file:

```env
# Airtable OAuth Credentials
AIRTABLE_CLIENT_ID=your_airtable_client_id_here
AIRTABLE_CLIENT_SECRET=your_airtable_client_secret_here
```

### 4. Deploy Backend Changes

The backend now includes:

- `GET /auth/airtable` - Initiates OAuth flow
- `GET /auth/airtable/callback` - Handles OAuth callback
- Updated `/api/airtable/create-record` - Uses OAuth tokens when available

## 🎯 User Experience Flow

### Before OAuth (API Key Method):

1. User clicks "Create Airtable Record"
2. Modal opens asking for API key and Base ID
3. User must manually create API token
4. User enters credentials each time

### After OAuth (Seamless Method):

1. User clicks "Connect Airtable" (purple button)
2. Redirected to Airtable for permission
3. Returns with "Airtable Connected" message
4. Future clicks show "Create Airtable Record" (orange button)
5. Modal only asks for Base ID (no API key needed)

## 🔄 Implementation Details

### JWT Token Structure

After OAuth, user JWTs include:

```javascript
{
  userId: "google_user_id",
  email: "user@example.com",
  name: "User Name",
  domain: "site-1.com",

  // Google tokens (from initial OAuth)
  googleAccessToken: "ya29.xxx",
  googleRefreshToken: "1//xxx",

  // Airtable tokens (from secondary OAuth)
  airtableAccessToken: "patXXX.xxx",
  airtableRefreshToken: "rtrXXX.xxx"
}
```

### Button Logic

Frontend shows different buttons based on token availability:

```javascript
// AuthComponent.tsx logic:
{
  user.airtableAccessToken ? (
    <button onClick={onShowAirtableModal}>
      🗂️ Create Airtable Record {/* Orange button */}
    </button>
  ) : (
    <button onClick={onConnectAirtable}>
      🔗 Connect Airtable {/* Purple button */}
    </button>
  );
}
```

### API Request Logic

Backend chooses authentication method:

```javascript
// Prefer OAuth tokens over API keys
let airtableAuth;
if (decoded.airtableAccessToken) {
  airtableAuth = { apiKey: decoded.airtableAccessToken };
} else if (airtableApiKey) {
  airtableAuth = { apiKey: airtableApiKey };
} else {
  return error("No authentication available");
}
```

## 🧪 Testing the Integration

### Test Scenarios

1. **Fresh User Login**:

   - Login with Google → See "Connect Airtable" button
   - Click → Redirected to Airtable → Grant permissions
   - Return with success message → Button changes to "Create Airtable Record"

2. **Existing OAuth User**:

   - Login → Immediately see "Create Airtable Record" button
   - Click → Modal only asks for Base ID
   - Create record successfully

3. **Fallback to API Keys**:
   - If OAuth fails, users can still use manual API key method
   - System gracefully handles both authentication methods

### Expected Behavior

✅ **Connect Airtable Flow**:

```
site-1.com → Click "Connect Airtable" →
Airtable OAuth → Grant permissions →
site-1.com/?token=updated_jwt&airtable_connected=true →
Success message → Button now shows "Create Airtable Record"
```

✅ **Domain Isolation**:

- OAuth tokens in JWT are domain-specific
- site-1.com and site-2.com have separate Airtable connections
- Each domain can connect to different Airtable accounts

## 🔍 Troubleshooting

### Common Issues

**"Missing Airtable OAuth credentials"**

- Check that `AIRTABLE_CLIENT_ID` and `AIRTABLE_CLIENT_SECRET` are set
- Verify credentials match your Airtable app settings

**"Redirect URI mismatch"**

- Ensure callback URL in Airtable app matches your backend URL exactly
- Format: `https://your-backend.com/auth/airtable/callback`

**"Insufficient permissions"**

- Verify your Airtable app has required scopes:
  - `data.records:read`
  - `data.records:write`
  - `schema.bases:read`

**Button doesn't change after OAuth**

- Check browser console for token parsing errors
- Verify JWT includes `airtableAccessToken` field
- Try logging out and logging back in

### Backend Logs

Look for these success messages:

```bash
🗂️ Starting Airtable OAuth flow...
📍 Airtable OAuth for domain: example.com
🔗 Redirecting to Airtable: https://airtable.com/oauth2/v1/authorize?...
🔄 Handling Airtable OAuth callback...
✅ Successfully received Airtable tokens
🏠 Redirecting back with Airtable tokens: example.com
```

For record creation:

```bash
🔐 Using Airtable OAuth token
📋 Creating Airtable record for domain: example.com
📝 Creating record with fields: ["Name"]
```

## 🔒 Security Considerations

### Token Storage

- ✅ OAuth tokens stored in domain-specific JWTs
- ✅ Tokens validated on every API request
- ✅ Automatic token refresh (when implemented)
- ✅ Secure transmission over HTTPS

### Domain Isolation

- ✅ Each domain gets separate OAuth flow
- ✅ Tokens tagged with requesting domain
- ✅ Cross-domain token usage prevented
- ✅ Independent Airtable account connections

### Permission Scoping

- ✅ Minimal required scopes requested
- ✅ Users explicitly grant permissions
- ✅ No unnecessary data access
- ✅ Revocable by user at any time

## 🚀 Advanced Features

### Token Refresh (Future Enhancement)

```javascript
// Endpoint to refresh expired Airtable tokens
app.post("/api/airtable/refresh-token", async (req, res) => {
  // Use refresh_token to get new access_token
  // Update JWT with new token
  // Return updated JWT to frontend
});
```

### Multiple Base Support

```javascript
// Enhanced form to let users select from their bases
const bases = await getAirtableBases(airtableToken);
// Show dropdown of available bases
// Auto-populate Base ID when base is selected
```

### Webhook Integration

```javascript
// Setup webhooks to sync changes back to your system
app.post("/webhooks/airtable", (req, res) => {
  // Handle Airtable record changes
  // Update your database accordingly
});
```

## ✅ Success Checklist

After setup, verify these work:

- [ ] Fresh user sees purple "Connect Airtable" button
- [ ] OAuth flow redirects to Airtable correctly
- [ ] User can grant permissions successfully
- [ ] Returns to domain with success message
- [ ] Button changes to orange "Create Airtable Record"
- [ ] Modal only shows Base ID field (no API key)
- [ ] Record creation works without API key
- [ ] Different domains can connect separately
- [ ] API key fallback still works if needed

## 🎉 Benefits Achieved

With Airtable OAuth integration, your multi-domain auth system now demonstrates:

- ✅ **Multiple OAuth Providers**: Google (identity) + Airtable (data)
- ✅ **Mixed Auth Patterns**: OAuth tokens + API key fallback
- ✅ **Seamless UX**: One-click integrations instead of manual setup
- ✅ **Enterprise Ready**: Proper token management and security
- ✅ **Domain Isolation**: Perfect separation even with OAuth
- ✅ **Flexible Architecture**: Easy to add more OAuth integrations

This OAuth integration transforms the Airtable experience from "manual and technical" to "one-click and user-friendly" while maintaining all the security and isolation properties of your multi-domain system! 🚀
