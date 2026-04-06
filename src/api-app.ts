import express from "express";
import axios from "axios";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";

export function createApiApp() {
  const app = express();
  app.use(express.json());

  const BASE_URL = "https://mknetworkbd.com";
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

  app.post("/api/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      await client.get(`${BASE_URL}/login.php`, { headers: COMMON_HEADERS });
      const response = await client.post(
        `${BASE_URL}/process_login_test.php`,
        new URLSearchParams({ userid: email, password: password, remember_me: "yes" }),
        {
          headers: { ...COMMON_HEADERS, "Content-Type": "application/x-www-form-urlencoded" },
          validateStatus: () => true,
        }
      );
      const cookies = await jar.getCookies(BASE_URL);
      const phpSessIdCookie = cookies.find((c) => c.key === "PHPSESSID");
      const phpSessId = phpSessIdCookie ? phpSessIdCookie.value : "";
      if (phpSessId) {
        res.json({ success: true, phpSessId });
      } else {
        res.status(401).json({ success: false, error: "Authentication failed." });
      }
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/get-number", async (req, res) => {
    try {
      const { phpSessId, range } = req.body;
      if (phpSessId) {
        await jar.setCookie(`PHPSESSID=${phpSessId}`, BASE_URL);
        await jar.setCookie(`mk_lang=en`, BASE_URL);
      }
      const response = await client.post(
        `${BASE_URL}/API/api_handler_test.php`,
        new URLSearchParams({ action: "get_number", range: range || "23276XXX" }),
        { headers: { ...COMMON_HEADERS, "Content-Type": "application/x-www-form-urlencoded" } }
      );
      if (response.headers.date) res.set('x-server-date', response.headers.date);
      res.json(response.data);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/get-history", async (req, res) => {
    try {
      const { phpSessId, limit, date } = req.query;
      if (phpSessId) {
        await jar.setCookie(`PHPSESSID=${phpSessId}`, BASE_URL);
        await jar.setCookie(`mk_lang=en`, BASE_URL);
      }
      const targetDate = (date as string) || new Date().toISOString().split("T")[0];
      const response = await client.get(`${BASE_URL}/API/api_handler_test.php`, {
        params: { action: "get_history", filter: "all", page: "1", limit: limit || "50", date: targetDate },
        headers: COMMON_HEADERS,
      });
      if (response.headers.date) res.set('x-server-date', response.headers.date);
      res.json(response.data);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return app;
}
