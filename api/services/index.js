function setSecureCookie(res, token) {
  res.cookie("access_token", token, {
    httpOnly: false,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: "none",
  });

  return res;
}

module.exports = { setSecureCookie };
