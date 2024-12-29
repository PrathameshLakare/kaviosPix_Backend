function setSecureCookie(res, token) {
  res.cookie("access_token", token, {
    httpOnly: true,
    secure: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: "none",
    domain: ".vercel.app",
  });

  return res;
}

module.exports = { setSecureCookie };
