import express from "express";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  const BASE_URL = "https://mknetworkbd.com";

  // Create a cookie jar and wrap axios
  const jar = new CookieJar();
  const client = wrapper(axios.create({ jar }));

  const COMMON_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "sec-ch-ua-platform": '"Android"',
    "sec-ch-ua": '"Chromium";v="146", "Not-A.Brand";v="24", "Android WebView";v="146"',
    "sec-ch-ua-mobile": "?1",
    "x-requested-with": "mark.via.gp",
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "cors",
    "sec-fetch-dest": "empty",
    "referer": "https://mknetworkbd.com/console.php",
    "accept-language": "en-US,en;q=0.9,ur-PK;q=0.8,ur;q=0.7",
    "priority": "u=1, i",
  };

  // Proxy Login
  app.post("/api/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      console.log(`Attempting login for: ${email}`);
      
      // 1. Visit login page to establish session
      await client.get(`${BASE_URL}/login.php`, {
        headers: COMMON_HEADERS,
      });

      // 2. Perform the actual login POST
      const response = await client.post(
        `${BASE_URL}/process_login_test.php`,
        new URLSearchParams({
          userid: email,
          password: password,
          remember_me: "yes",
        }),
        {
          headers: {
            ...COMMON_HEADERS,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          validateStatus: () => true,
        }
      );

      console.log(`Login response status: ${response.status}`);
      
      // Extract PHPSESSID from the cookie jar
      const cookies = await jar.getCookies(BASE_URL);
      const phpSessIdCookie = cookies.find((c) => c.key === "PHPSESSID");
      const phpSessId = phpSessIdCookie ? phpSessIdCookie.value : "";

      // If we got a session ID, we consider it a success for now
      if (phpSessId) {
        console.log("Login successful, session ID obtained.");
        res.json({ success: true, phpSessId });
      } else {
        console.log("Login failed: No PHPSESSID found in cookie jar.");
        res.status(401).json({ 
          success: false, 
          error: "Authentication failed. No session cookie received. Please check your credentials." 
        });
      }
    } catch (error: any) {
      console.error("Login error:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Proxy Get Number
  app.post("/api/get-number", async (req, res) => {
    try {
      const { phpSessId, range } = req.body;
      
      // Manually set the cookie in the jar for this request if provided
      if (phpSessId) {
        await jar.setCookie(`PHPSESSID=${phpSessId}`, BASE_URL);
        await jar.setCookie(`mk_lang=en`, BASE_URL);
      }

      const response = await client.post(
        `${BASE_URL}/API/api_handler_test.php`,
        new URLSearchParams({
          action: "get_number",
          range: range || "23276XXX",
        }),
        {
          headers: {
            ...COMMON_HEADERS,
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );
      if (response.headers.date) {
        res.set('x-server-date', response.headers.date);
      }
      res.json(response.data);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Proxy Get History
  app.get("/api/get-history", async (req, res) => {
    try {
      const { phpSessId, limit, date } = req.query;
      
      if (phpSessId) {
        await jar.setCookie(`PHPSESSID=${phpSessId}`, BASE_URL);
        await jar.setCookie(`mk_lang=en`, BASE_URL);
      }

      const targetDate = (date as string) || new Date().toISOString().split("T")[0];
      const response = await client.get(`${BASE_URL}/API/api_handler_test.php`, {
        params: {
          action: "get_history",
          filter: "all",
          page: "1",
          limit: limit || "50",
          date: targetDate,
        },
        headers: COMMON_HEADERS,
      });
      if (response.headers.date) {
        res.set('x-server-date', response.headers.date);
      }
      res.json(response.data);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Proxy Get Active Ranges
  app.get("/api/get-active-ranges", async (req, res) => {
    try {
      const { phpSessId } = req.query;
      
      if (phpSessId) {
        await jar.setCookie(`PHPSESSID=${phpSessId}`, BASE_URL);
        await jar.setCookie(`mk_lang=en`, BASE_URL);
      }

      const response = await client.get(`${BASE_URL}/console.php`, {
        params: {
          ajax: "1",
        },
        headers: COMMON_HEADERS,
      });
      
      // The response is likely HTML. We'll send it as is or try to parse it.
      // For now, let's send the raw text and we'll handle parsing in the frontend or here.
      res.send(response.data);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
