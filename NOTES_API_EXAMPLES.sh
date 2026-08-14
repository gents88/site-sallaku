#!/bin/bash

# 📝 Notes API - cURL Examples
# Complete reference for testing the blog comments API

API_URL="http://localhost:3000/api"
ARTICLE_ID="507f1f77bcf86cd799439011"
NOTE_ID="507f1f77bcf86cd799439012"
JWT_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"

# ──────────────────────────────────────────────────────────────
# PUBLIC ENDPOINTS (No authentication required)
# ──────────────────────────────────────────────────────────────

echo "==================== PUBLIC ENDPOINTS ===================="
echo

# 1. Create a Note
echo "1️⃣  Create a Note"
echo "POST $API_URL/notes/$ARTICLE_ID"
curl -X POST "$API_URL/notes/$ARTICLE_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Mario Rossi",
    "email": "mario@example.com",
    "content": "Articolo fantastico! Molto interessante e ben scritto. Grazie per aver condiviso questa conoscenza.",
    "honeypot": ""
  }' | jq .

echo -e "\n"

# 2. Create a Note (Anonymous)
echo "2️⃣  Create a Note (Anonymous - no name/email)"
echo "POST $API_URL/notes/$ARTICLE_ID"
curl -X POST "$API_URL/notes/$ARTICLE_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Mi è piaciuto molto questo post! Scopri di più sul tema!",
    "honeypot": ""
  }' | jq .

echo -e "\n"

# 3. Get Notes for Article
echo "3️⃣  Get Approved Notes for Article"
echo "GET $API_URL/notes/$ARTICLE_ID?limit=50&skip=0"
curl -X GET "$API_URL/notes/$ARTICLE_ID?limit=50&skip=0" | jq .

echo -e "\n"

# 4. Get Notes with Pagination
echo "4️⃣  Get Notes with Pagination (page 2)"
echo "GET $API_URL/notes/$ARTICLE_ID?limit=10&skip=10"
curl -X GET "$API_URL/notes/$ARTICLE_ID?limit=10&skip=10" | jq .

echo -e "\n"

# ──────────────────────────────────────────────────────────────
# ADMIN ENDPOINTS (JWT Token required)
# ──────────────────────────────────────────────────────────────

echo "==================== ADMIN ENDPOINTS ===================="
echo

# 5. Get Notes Statistics (Admin Only)
echo "5️⃣  Get Notes Statistics (Admin)"
echo "GET $API_URL/notes/$ARTICLE_ID/stats"
curl -X GET "$API_URL/notes/$ARTICLE_ID/stats" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq .

echo -e "\n"

# 6. Get Single Note Details (Admin Only)
echo "6️⃣  Get Single Note Details (Admin)"
echo "GET $API_URL/notes/$NOTE_ID/admin"
curl -X GET "$API_URL/notes/$NOTE_ID/admin" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq .

echo -e "\n"

# 7. Approve a Note (Admin Only)
echo "7️⃣  Approve a Note"
echo "PATCH $API_URL/notes/$NOTE_ID/approve"
curl -X PATCH "$API_URL/notes/$NOTE_ID/approve" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" | jq .

echo -e "\n"

# 8. Reject a Note (Admin Only)
echo "8️⃣  Reject a Note"
echo "PATCH $API_URL/notes/$NOTE_ID/reject"
curl -X PATCH "$API_URL/notes/$NOTE_ID/reject" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" | jq .

echo -e "\n"

# 9. Mark Note as Spam (Admin Only)
echo "9️⃣  Mark Note as Spam"
echo "PATCH $API_URL/notes/$NOTE_ID/spam"
curl -X PATCH "$API_URL/notes/$NOTE_ID/spam" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" | jq .

echo -e "\n"

# 10. Delete a Note (Admin Only)
echo "🔟  Delete a Note"
echo "DELETE $API_URL/notes/$NOTE_ID"
curl -X DELETE "$API_URL/notes/$NOTE_ID" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" -v

echo -e "\n"

# ──────────────────────────────────────────────────────────────
# ERROR CASES & VALIDATION
# ──────────────────────────────────────────────────────────────

echo "==================== ERROR CASES ===================="
echo

# 11. Invalid Article ID
echo "11️⃣  Invalid Article ID"
echo "GET $API_URL/notes/invalid-id"
curl -X GET "$API_URL/notes/invalid-id" | jq .

echo -e "\n"

# 12. Missing Required Field
echo "1️⃣2️⃣  Missing Required Content Field"
echo "POST $API_URL/notes/$ARTICLE_ID"
curl -X POST "$API_URL/notes/$ARTICLE_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "honeypot": ""
  }' | jq .

echo -e "\n"

# 13. Invalid Email Format
echo "1️⃣3️⃣  Invalid Email Format"
echo "POST $API_URL/notes/$ARTICLE_ID"
curl -X POST "$API_URL/notes/$ARTICLE_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "not-an-email",
    "content": "Test content",
    "honeypot": ""
  }' | jq .

echo -e "\n"

# 14. Content Too Short
echo "1️⃣4️⃣  Content Too Short"
echo "POST $API_URL/notes/$ARTICLE_ID"
curl -X POST "$API_URL/notes/$ARTICLE_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Hi",
    "honeypot": ""
  }' | jq .

echo -e "\n"

# 15. Honeypot Filled (Spam Bot Detection)
echo "1️⃣5️⃣  Honeypot Filled (Spam Detection)"
echo "POST $API_URL/notes/$ARTICLE_ID"
curl -X POST "$API_URL/notes/$ARTICLE_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Spammer",
    "email": "spammer@example.com",
    "content": "Visit my site!",
    "honeypot": "https://spam.com"
  }' | jq .

echo -e "\n"

# ──────────────────────────────────────────────────────────────
# RATE LIMITING TEST
# ──────────────────────────────────────────────────────────────

echo "==================== RATE LIMITING ===================="
echo

echo "Testing rate limiting (5 requests per minute):"
echo "Send requests in rapid succession..."
echo

for i in {1..6}; do
  echo "Request $i:"
  curl -s -w "HTTP Status: %{http_code}\n" -X POST "$API_URL/notes/$ARTICLE_ID" \
    -H "Content-Type: application/json" \
    -d "{
      \"content\": \"Test note $i\",
      \"honeypot\": \"\"
    }" | jq . 2>/dev/null || echo "Rate limited!"
  sleep 1
done

echo -e "\n"

# ──────────────────────────────────────────────────────────────
# BATCH OPERATIONS (Admin)
# ──────────────────────────────────────────────────────────────

echo "==================== BATCH OPERATIONS ===================="
echo

echo "Get stats for multiple articles:"
for ARTICLE_ID in "507f1f77bcf86cd799439011" "507f1f77bcf86cd799439012" "507f1f77bcf86cd799439013"; do
  echo "Article: $ARTICLE_ID"
  curl -s -X GET "$API_URL/notes/$ARTICLE_ID/stats" \
    -H "Authorization: Bearer $JWT_TOKEN" | jq '.total'
done

echo -e "\n✅ All examples completed!"
