const express = require("express");
const axios = require("axios");
const cors = require("cors");
const multer = require("multer");
const cloudinary = require("cloudinary");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");

require("dotenv").config();

const { initializeDatabase } = require("./db/db.connect.js");
const { setSecureCookie } = require("./services/index.js");
const cookieParser = require("cookie-parser");

const User = require("./models/user.model.js");
const Album = require("./models/album.model.js");
const Image = require("./models/image.model.js");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());
app.use(cors({ credentials: true, origin: `${process.env.FRONTEND_URL}` }));
app.use(cookieParser());
initializeDatabase();

//jwt token verfication function
const JWT_SECRET = process.env.JWT_SECRET;

const verifyJWT = (req, res, next) => {
  const token = req.headers["authorization"];

  if (!token) {
    return res.status(401).json({ message: "Token not provided." });
  }

  const tokenParts = token.split(" ");

  try {
    const decodedToken = jwt.verify(tokenParts[1], JWT_SECRET);
    req.user = decodedToken;
    next();
  } catch (error) {
    return res.status(402).json({ message: "Invalid token" });
  }
};

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = multer.diskStorage({});
const upload = multer({
  storage,
});

app.get("/", (req, res) => {
  res.send(`<h1>Welcome to OAuth API Server.</h1>`);
});

app.get("/auth/google", (req, res) => {
  const googleAuthUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=${process.env.BACKEND_URL}/auth/google/callback&response_type=code&scope=profile email`;
  res.redirect(googleAuthUrl);
});

app.get(`/auth/google/callback`, async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send(`Authorization code not provided.`);
  }

  let accessToken;
  try {
    const tokenResponse = await axios.post(
      `https://oauth2.googleapis.com/token`,
      {
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: `${process.env.BACKEND_URL}/auth/google/callback`,
      },
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    accessToken = tokenResponse.data.access_token;

    const googleUserDataResponse = await axios.get(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const { id, email, name, picture } = googleUserDataResponse.data;

    let user = await User.findOne({ googleId: id });

    if (!user) {
      user = new User({
        googleId: id,
        email,
        name,
        profilePicture: picture,
      });
      await user.save();
    }

    const jwtToken = jwt.sign(
      { id: user._id, email: user.email, role: "user" },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    setSecureCookie(res, jwtToken);
    return res.redirect(`${process.env.FRONTEND_URL}/home`);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to fetch access token from Google." });
  }
});

app.get("/user/profile/google", verifyJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    res.json({ message: "User information fetch succcesfully.", user });
  } catch (error) {
    res.status(500).json({ error: "Could not fetch user Google profile." });
  }
});

app.post("/albums", verifyJWT, async (req, res) => {
  try {
    const { name, description } = req.body;
    const userId = req.user.id;

    const albumData = { name, description, owner: userId };

    const newAlbum = new Album(albumData);
    const album = await newAlbum.save();

    res.status(200).json({ message: "Album saved successfully.", album });
  } catch (error) {
    res.status(500).json({ error: "Internal server error." });
  }
});

app.put("/albums/:albumId", verifyJWT, async (req, res) => {
  try {
    const userId = req.user.id;

    const album = await Album.findById(req.params.albumId);
    if (!album) {
      return res.status(404).json({ message: "Album not found." });
    }

    if (userId !== album.owner) {
      return res
        .status(403)
        .json({ message: "You are not authorized to update this album." });
    }

    const updatedAlbum = await Album.findByIdAndUpdate(
      req.params.albumId,
      req.body,
      { new: true }
    );

    res
      .status(200)
      .json({ message: "Album updated successfully.", album: updatedAlbum });
  } catch (error) {
    res.status(500).json({ error: "Internal server error." });
  }
});

app.post("/albums/:albumId/share", verifyJWT, async (req, res) => {
  try {
    const { emails } = req.body;
    const userId = req.user.id;

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ message: "No emails provided." });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = emails.filter((email) => !emailRegex.test(email));

    if (invalidEmails.length > 0) {
      return res.status(400).json({
        message: `Invalid email addresses: ${invalidEmails.join(", ")}`,
      });
    }

    // Fetch users with the given emails
    const users = await User.find({ email: { $in: emails } });

    const existingEmails = new Set(users.map((user) => user.email));
    const missingEmails = emails.filter((email) => !existingEmails.has(email));

    if (missingEmails.length > 0) {
      return res.status(404).json({
        message: `Users not found for emails: ${missingEmails.join(", ")}`,
      });
    }

    const album = await Album.findById(req.params.albumId);

    if (!album) {
      return res.status(404).json({ message: "Album not found." });
    }

    if (userId !== album.owner) {
      return res
        .status(403)
        .json({ message: "You are not authorized to update this album." });
    }

    album.sharedUsers = [...new Set([...album.sharedUsers, ...emails])];

    const updatedAlbum = await album.save();

    // Return the updated album
    res
      .status(200)
      .json({ message: "Album updated successfully.", album: updatedAlbum });
  } catch (error) {
    res.status(500).json({ error: "Internal server error." });
  }
});

app.delete("/albums/:albumId", verifyJWT, async (req, res) => {
  try {
    const userId = req.user.id;

    const album = await Album.findById(req.params.albumId);
    if (!album) {
      return res.status(404).json({ message: "Album not found." });
    }

    if (userId !== album.owner) {
      return res
        .status(403)
        .json({ message: "You are not authorized to update this album." });
    }

    const deletedAlbum = await Album.findByIdAndDelete(req.params.albumId);

    res
      .status(200)
      .json({ message: "Album updated successfully.", album: deletedAlbum });
  } catch (error) {
    res.status(500).json({ error: "Internal server error." });
  }
});

app.post(
  "/albums/:albumId/images",
  verifyJWT,
  upload.single("file"),
  async (req, res) => {
    try {
      const { albumId } = req.params;
      const { tags, person, isFavorite, name } = req.body;
      const userId = req.user.id;

      const album = await Album.findById(albumId);

      if (!album) {
        return res.status(404).json({ message: "Album not found." });
      }

      if (userId !== album.owner) {
        return res
          .status(403)
          .json({ message: "You are not authorized to upload to this album." });
      }

      const file = req.file;
      if (!file) return res.status(400).send("No file uploaded");

      //Extract file size and type
      const fileSize = fs.statSync(file.path).size;
      const fileType = path.extname(file.originalname).toLowerCase();

      if (fileSize > 5 * 1024 * 1024) {
        return res
          .status(400)
          .json({ message: "File size exceeds the 5MB limit." });
      }

      if (![".jpg", ".jpeg", ".png", ".gif"].includes(fileType)) {
        return res.status(400).json({
          message: "Only image files are allowed (jpg, jpeg, png, gif).",
        });
      }

      const result = await cloudinary.uploader.upload(file.path, {
        folder: "uploads",
      });

      console.log(result.secure_url);
      const newImage = {
        albumId: albumId,
        file: result.secure_url,
        tags: tags ? tags.split(",").map((tag) => tag.trim()) : [],
        person: person,
        isFavorite: isFavorite || false,
        name: name,
        size: fileSize,
      };

      const imageData = new Image(newImage);
      await imageData.save();

      res.status(200).json({
        message: "Image uploaded successfully.",
        imageData,
      });
    } catch (error) {
      res.status(500).json({ error: "Internal server error." });
    }
  }
);

app.put(
  "/albums/:albumId/images/:imageId/favorite",
  verifyJWT,
  async (req, res) => {
    try {
      const { albumId, imageId } = req.params;
      const userId = req.user.id;

      const album = await Album.findById(albumId);
      if (!album) {
        return res.status(404).json({ message: "Album not found." });
      }

      if (userId !== album.owner) {
        return res
          .status(403)
          .json({ message: "You are not authorized to upload to this album." });
      }

      const image = await Image.findById(imageId);
      if (!image) {
        return res.status(404).json({ message: "Image not found." });
      }

      const updatedImage = await Image.findByIdAndUpdate(
        imageId,
        { isFavorite: !image.isFavorite },
        { new: true }
      );

      res
        .status(200)
        .json({ message: "Image updated successfully.", updatedImage });
    } catch (error) {
      res.status(500).json({ error: "Internal server error." });
    }
  }
);

app.put(
  "/albums/:albumId/images/:imageId/comments",
  verifyJWT,
  async (req, res) => {
    try {
      const { albumId, imageId } = req.params;
      const { comment } = req.body;
      const userId = req.user.id;

      const album = await Album.findById(albumId);
      if (!album) {
        return res.status(404).json({ message: "Album not found." });
      }

      const image = await Image.findById(imageId);
      if (!image) {
        return res.status(404).json({ message: "Image not found." });
      }

      image.comments.push({ user: userId, text: comment });

      const newUpdatedImage = await image.save();

      const updatedImage = await Image.findById(newUpdatedImage._id).populate(
        "comments.user"
      );

      res
        .status(200)
        .json({ message: "Image updated successfully.", updatedImage });
    } catch (error) {
      res.status(500).json({ error: "Internal server error." });
    }
  }
);

app.delete("/albums/:albumId/images/:imageId", verifyJWT, async (req, res) => {
  try {
    const { albumId, imageId } = req.params;
    const userId = req.user.id;

    const album = await Album.findById(albumId);
    if (!album) {
      return res.status(404).json({ message: "Album not found." });
    }

    if (userId !== album.owner) {
      return res.status(403).json({
        message: "You are not authorized to delete image from this album.",
      });
    }

    const image = await Image.findByIdAndDelete(imageId);
    if (!image) {
      return res.status(404).json({ message: "Image not found." });
    }

    res.status(200).json({ message: "Image deleted successfully.", image });
  } catch (error) {
    res.status(500).json({ error: "Internal server error." });
  }
});

app.get("/albums", verifyJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const albums = await Album.find({ owner: userId });
    res.status(200).json({ message: "Albums fetch successfully.", albums });
  } catch (error) {
    res.status(500).json({ error: "Internal server error." });
  }
});

app.get("/albums/shared", verifyJWT, async (req, res) => {
  try {
    const userEmail = req.user.email;

    const sharedAlbums = await Album.find({ sharedUsers: userEmail });

    res.status(200).json({
      message: "Shared albums fetched successfully.",
      albums: sharedAlbums,
    });
  } catch (error) {
    res.status(500).json({ error: "Internal server error." });
  }
});

app.put(
  "/albums/:albumId/images/:imageId/favorite",
  verifyJWT,
  async (req, res) => {
    try {
      const { albumId, imageId } = req.params;
      const userId = req.user.id;

      const album = await Album.findById(albumId);
      if (!album) {
        return res.status(404).json({ message: "Album not found." });
      }

      if (userId !== album.owner) {
        return res
          .status(403)
          .json({ message: "You are not authorized to update this album." });
      }

      const image = await Image.findById(imageId);
      if (!image || image.albumId.toString() !== albumId) {
        return res
          .status(404)
          .json({ message: "Image not found in this album." });
      }

      image.isFavorite = !image.isFavorite;
      const updatedImage = await image.save();

      res.status(200).json({
        message: `Image favorite status updated successfully.`,
        image: updatedImage,
      });
    } catch (error) {
      res.status(500).json({ error: "Internal server error." });
    }
  }
);

app.get("/albums/:albumId/images", verifyJWT, async (req, res) => {
  try {
    const { albumId } = req.params;
    const { tags } = req.query;

    const query = { albumId };

    if (tags) {
      query["tags"] = tags;
    }

    const images = await Image.find(query).populate("comments.user");

    res.status(200).json({ message: "Images fetched successfully.", images });
  } catch (error) {
    res.status(500).json({ error: "Internal server error." });
  }
});

app.get("/albums/:albumId", async (req, res) => {
  try {
    const album = await Album.findById(req.params.albumId);
    if (!album) {
      return res.status(404).json({ error: "Album not found." });
    }
    res.status(200).json(album);
  } catch (error) {
    res.status(500).json({ error: "Internal server error." });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
