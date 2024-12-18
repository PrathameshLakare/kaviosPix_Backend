const mongoose = require("mongoose");
const { type } = require("os");

const imageSchema = new mongoose.Schema(
  {
    albumId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Album",
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    file: { type: String, required: true },
    tags: [
      {
        type: String,
      },
    ],
    person: {
      type: String,
    },
    isFavorite: {
      type: Boolean,
      default: false,
    },
    comments: [
      {
        text: { type: String },
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    size: {
      type: Number,
      required: true,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

const Image = mongoose.model("Image", imageSchema);

module.exports = Image;
