const PRIMARY_HOST = "tosky.top";

interface Env {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
}

export default {
  fetch(request: Request, env: Env): Promise<Response> | Response {
    const url = new URL(request.url);
    let redirect = false;

    if (url.hostname === `www.${PRIMARY_HOST}`) {
      url.hostname = PRIMARY_HOST;
      redirect = true;
    }

    if (url.pathname === "/okx" || url.pathname === "/okx/") {
      url.pathname = "/";
      redirect = true;
    }

    if (redirect) {
      return Response.redirect(url, 308);
    }

    return env.ASSETS.fetch(request);
  },
};
