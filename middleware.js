import { next } from "@vercel/functions";

const COOKIE_NAME = "trainer_auth";

export const config = {
  matcher: "/(.*)",
};

function loginPage(error = "") {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>职业培训师题库登录</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        background: #f6f7f9;
        color: #1f2933;
        font-family: "Microsoft YaHei", "PingFang SC", Arial, sans-serif;
      }
      form {
        width: min(420px, 100%);
        padding: 24px;
        border: 1px solid #d9dee7;
        border-radius: 8px;
        background: #fff;
        box-shadow: 0 16px 50px rgb(31 41 51 / 10%);
      }
      h1 { margin: 0 0 8px; font-size: 22px; }
      p { margin: 0 0 18px; color: #6b7280; line-height: 1.6; }
      label { display: grid; gap: 8px; color: #344054; font-size: 14px; }
      input {
        width: 100%;
        height: 44px;
        padding: 0 12px;
        border: 1px solid #cfd6e1;
        border-radius: 6px;
        font: inherit;
      }
      button {
        width: 100%;
        height: 44px;
        margin-top: 14px;
        border: 0;
        border-radius: 6px;
        background: #176f75;
        color: #fff;
        font: inherit;
        font-weight: 700;
      }
      .error {
        margin-top: 12px;
        color: #b42318;
      }
    </style>
  </head>
  <body>
    <form method="post" action="/_login">
      <h1>职业培训师题库</h1>
      <p>请输入访问密码后继续学习。</p>
      <label>
        访问密码
        <input name="password" type="password" autocomplete="current-password" autofocus />
      </label>
      <button type="submit">进入题库</button>
      ${error ? `<p class="error">${error}</p>` : ""}
    </form>
  </body>
</html>`;
}

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function authToken() {
  const password = process.env.ACCESS_PASSWORD || "";
  return sha256(`trainer-question-bank:${password}`);
}

function getCookie(request, name) {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const password = process.env.ACCESS_PASSWORD;

  if (!password) {
    return next();
  }

  const expectedToken = await authToken();
  const currentToken = getCookie(request, COOKIE_NAME);
  if (currentToken === expectedToken) {
    return next();
  }

  if (url.pathname === "/_login" && request.method === "POST") {
    const body = await request.formData();
    const submitted = String(body.get("password") || "");
    if (submitted === password) {
      return new Response(null, {
        status: 303,
        headers: {
          Location: "/",
          "Set-Cookie": `${COOKIE_NAME}=${encodeURIComponent(expectedToken)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
        },
      });
    }
    return new Response(loginPage("密码不正确，请重试。"), {
      status: 401,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return new Response(loginPage(), {
    status: 401,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
