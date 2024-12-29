function setSecureCookie(res, token) {
  res.cookie("access_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: "none",
    domain: ".example.com",
  });

  return res;
}

module.exports = { setSecureCookie };
