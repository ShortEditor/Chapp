npx vercel env rm NEXT_PUBLIC_BACKEND_URL production --yes
npx vercel env add NEXT_PUBLIC_BACKEND_URL production --value "https://chapp-oxa7.onrender.com" --yes
npx vercel --prod --yes
