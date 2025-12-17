# Get File Error Message - Quick Steps

## Method 1: Browser Console (Easiest)

1. **Open your live site**: https://rauljr10980.github.io/county-cad-tracker/
2. **Open DevTools** (F12) → **Console** tab
3. **Paste this command** and press Enter:

```javascript
fetch('https://county-cad-tracker-production.up.railway.app/api/files')
  .then(r => r.json())
  .then(data => {
    console.log('Files:', data);
    const errorFile = data.find(f => f.status === 'error');
    if (errorFile) {
      console.log('ERROR FILE:', errorFile);
      console.log('ERROR MESSAGE:', errorFile.errorMessage);
      console.log('ERROR DETAILS:', errorFile.errorDetails);
    }
  });
```

4. **Look at the console output** - it will show the error message!

## Method 2: Direct URL

Just open this URL in your browser:
```
https://county-cad-tracker-production.up.railway.app/api/files
```

You'll see the JSON. Find the file with `"status": "error"` and look for `"errorMessage"`.

## Method 3: Network Tab

1. **Open DevTools** (F12) → **Network** tab
2. **Refresh the page**
3. **Find** `/api/files` request
4. **Click it** → **Response** tab
5. **Look for** the file with `"status": "error"`
6. **Find** `"errorMessage"` field

## What to Share

Once you see the error, share:
- The `errorMessage` value
- The `status` field
- Any `errorDetails` if present

This will tell us exactly why processing failed!

