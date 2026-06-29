import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;
const DB_FILE = path.join(process.cwd(), "database.json");
const UPLOADS_DIR = path.join(process.cwd(), "uploads");

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Increase limits to allow 25MB base64 uploads
app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ limit: "30mb", extended: true }));

// Serve static uploaded audio files
app.use("/uploads", express.static(UPLOADS_DIR));

// Initialize Gemini API
const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    })
  : null;

// Initial Seed Data
const initialUsers = [
  {
    id: "user_admin",
    username: "admin",
    password: "admin123",
    displayName: "Алексей (Producer)",
    avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&h=150&q=80",
    role: "admin",
  },
  {
    id: "user_maria",
    username: "maria",
    password: "maria123",
    displayName: "Мария (Singer)",
    avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&h=150&q=80",
    role: "user",
  },
  {
    id: "user_vlad",
    username: "vlad",
    password: "vlad123",
    displayName: "Влад (Beatmaker)",
    avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&h=150&q=80",
    role: "user",
  },
];

const initialProjects = [
  {
    id: "project_1",
    title: "Ночной Экспресс",
    type: "single",
    coverUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=400&h=400&q=80",
    tags: ["В процессе", "Synthwave", "Русский поп"],
    participants: [
      { userId: "user_admin", username: "admin", displayName: "Алексей (Producer)", role: "owner" },
      { userId: "user_maria", username: "maria", displayName: "Мария (Singer)", role: "editor" },
      { userId: "user_vlad", username: "vlad", displayName: "Влад (Beatmaker)", role: "editor" },
    ],
    tracks: [
      {
        id: "track_1_1",
        title: "Ночной Экспресс (Основной трек)",
        lyrics: `[Куплет 1, Влад]
Мимо окон неон скользит по стеклу,
Город спит, но мы не верим теплу.
Фары встречных машин режут темноту,
Мы уезжаем, ища высоту.

[Припев, Мария]
Ночной экспресс летит в рассвет,
Назад пути нам больше нет.
Стирая грани, миг ловя,
Где ты и я, где ты и я...
На скорости забудь печаль,
Умчит экспресс в пустую даль.

[Куплет 2, Мария]
Дым сигарет и холодный чай,
Ты мне тихо скажи "прощай".
Или останься на пару минут,
Где нас дороги опять найдут.`,
        tags: ["Готов текст", "Требуется демо вокала"],
        versionHistory: [
          {
            id: "ver_1",
            lyrics: `[Куплет 1]\nМимо окон неон скользит по стеклу,\nГород спит...`,
            author: "Влад (Beatmaker)",
            timestamp: "2026-06-28T12:00:00.000Z",
            label: "Первый черновик бита и текста",
          },
          {
            id: "ver_2",
            lyrics: `[Куплет 1, Влад]\nМимо окон неон скользит по стеклу,\nГород спит, но мы не верим теплу.\n\n[Припев, Мария]\nНочной экспресс летит в рассвет...`,
            author: "Мария (Singer)",
            timestamp: "2026-06-28T16:30:00.000Z",
            label: "Добавлен припев и вокальная линия",
          },
          {
            id: "ver_3",
            lyrics: `[Куплет 1, Влад]\nМимо окон неон скользит по стеклу,\nГород спит, но мы не верим теплу.\nФары встречных машин режут темноту,\nМы уезжаем, ища высоту.\n\n[Припев, Мария]\nНочной экспресс летит в рассвет,\nНазад пути нам больше нет.\nСтирая грани, миг ловя,\nГде ты и я, где ты и я...\nНа скорости забудь печаль,\nУмчит экспресс в пустую даль.\n\n[Куплет 2, Мария]\nДым сигарет и холодный чай,\nТы мне тихо скажи "прощай".\nИли останься на пару минут,\Gamma нас дороги опять найдут.`,
            author: "Алексей (Producer)",
            timestamp: "2026-06-29T02:00:00.000Z",
            label: "Финальная редактура структуры",
          },
        ],
        audioVersions: [
          {
            id: "audio_1",
            filename: "Synth_Beat_v1_Rough.mp3",
            size: "4.2 MB",
            url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
            isExternal: false,
            uploadedBy: "Влад (Beatmaker)",
            timestamp: "2026-06-28T12:15:00.000Z",
            versionNumber: 1,
          },
          {
            id: "audio_2",
            filename: "Express_Vocal_Demo_v2.mp3",
            size: "8.1 MB",
            url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
            isExternal: false,
            uploadedBy: "Мария (Singer)",
            timestamp: "2026-06-28T17:10:00.000Z",
            versionNumber: 2,
          },
        ],
        comments: [
          {
            id: "comm_1",
            lineIndex: 1,
            author: "Мария (Singer)",
            text: "Давайте сделаем здесь вокал чуть тише, чтобы чувствовался плотный бас бита.",
            timestamp: "2026-06-28T18:00:00.000Z",
            resolved: false,
          },
          {
            id: "comm_2",
            lineIndex: 10,
            author: "Алексей (Producer)",
            text: "Переход к припеву звучит отлично, ритм-секция здесь залетает на ура!",
            timestamp: "2026-06-29T02:15:00.000Z",
            resolved: true,
          },
        ],
        chat: [
          {
            id: "chat_1",
            author: "Влад (Beatmaker)",
            text: "Привет всем! Закинул базовый бит, текст накидал в первый куплет.",
            timestamp: "2026-06-28T12:16:00.000Z",
          },
          {
            id: "chat_2",
            author: "Мария (Singer)",
            text: "Привет! Бит огонь, прям в духе ретровейва. Напела припев поверх, закинула демо v2.",
            timestamp: "2026-06-28T17:12:00.000Z",
          },
          {
            id: "chat_3",
            author: "Алексей (Producer)",
            text: "Очень круто получается! Добавил второй куплет, давайте допишем вокал и я займусь сведением.",
            timestamp: "2026-06-29T02:20:00.000Z",
          },
        ],
        tasks: [
          {
            id: "task_1",
            title: "Записать чистый вокал для припева (Мария)",
            status: "in-progress",
            assignedTo: "Мария (Singer)",
            timestamp: "2026-06-28T17:15:00.000Z",
          },
          {
            id: "task_2",
            title: "Сведение и мастеринг трека",
            status: "todo",
            assignedTo: "Алексей (Producer)",
            timestamp: "2026-06-29T02:22:00.000Z",
          },
          {
            id: "task_3",
            title: "Написать аранжировку куплета",
            status: "done",
            assignedTo: "Влад (Beatmaker)",
            timestamp: "2026-06-28T12:20:00.000Z",
          },
        ],
        annotations: [
          {
            id: "annot_1",
            timestampSeconds: 15,
            text: "Тут плавно вступают ударные, нужно добавить реверберации на вокал",
            author: "Влад (Beatmaker)",
            createdAt: "2026-06-28T12:30:00.000Z",
          },
          {
            id: "annot_2",
            timestampSeconds: 42,
            text: "Начало припева: сделать взрывной переход по громкости",
            author: "Алексей (Producer)",
            createdAt: "2026-06-29T02:30:00.000Z",
          },
        ],
      },
    ],
    createdAt: "2026-06-28T11:30:00.000Z",
    updatedAt: "2026-06-29T02:30:00.000Z",
  },
  {
    id: "project_2",
    title: "Акустический Альбом",
    type: "album",
    coverUrl: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=400&h=400&q=80",
    tags: ["Акустика", "Инди", "Альбом"],
    participants: [
      { userId: "user_maria", username: "maria", displayName: "Мария (Singer)", role: "owner" },
      { userId: "user_admin", username: "admin", displayName: "Алексей (Producer)", role: "editor" },
    ],
    tracks: [
      {
        id: "track_2_1",
        title: "01. Ветер в струнах",
        lyrics: `[Интро - гитара]

[Куплет 1]
Ветер играет со старой струной,
Этой весной я хочу быть собой.
Пыльные улицы, старый причал,
Я помню всё, о чём долго молчал.

[Припев]
Вспыхнет костёр у холодной реки,
Мы так близки, и вдвоём далеки.
Голос гитары летит в темноту,
Каждый аккорд обретает мечту.`,
        tags: ["Набросок", "Акустика"],
        versionHistory: [],
        audioVersions: [
          {
            id: "audio_acoustic_1",
            filename: "Acoustic_Guitar_Draft.mp3",
            size: "3.5 MB",
            url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
            isExternal: false,
            uploadedBy: "Мария (Singer)",
            timestamp: "2026-06-27T15:00:00.000Z",
            versionNumber: 1,
          },
        ],
        comments: [],
        chat: [],
        tasks: [],
        annotations: [],
      },
      {
        id: "track_2_2",
        title: "02. Тихие Шаги",
        lyrics: `[Куплет 1]
Тихие шаги по мокрой листве,
Я вижу тень на кирпичной стене.
Осень заходит без стука в наш дом,
Всё, что забыто — оставим на потом.`,
        tags: ["Только текст"],
        versionHistory: [],
        audioVersions: [],
        comments: [],
        chat: [],
        tasks: [],
        annotations: [],
      },
    ],
    createdAt: "2026-06-27T14:30:00.000Z",
    updatedAt: "2026-06-27T15:00:00.000Z",
  },
];

const initialNotifications = [
  {
    id: "not_1",
    projectId: "project_1",
    projectName: "Ночной Экспресс",
    trackId: "track_1_1",
    trackName: "Ночной Экспресс (Основной трек)",
    message: "обновил текст песни и добавил второй куплет",
    author: "Алексей (Producer)",
    timestamp: "2026-06-29T02:01:00.000Z",
    read: false,
  },
  {
    id: "not_2",
    projectId: "project_1",
    projectName: "Ночной Экспресс",
    trackId: "track_1_1",
    trackName: "Ночной Экспресс (Основной трек)",
    message: "загрузил аудио демку v2 'Express_Vocal_Demo_v2.mp3'",
    author: "Мария (Singer)",
    timestamp: "2026-06-28T17:11:00.000Z",
    read: true,
  },
];

// Load Database
function loadDB() {
  if (fs.existsSync(DB_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
    } catch (e) {
      console.error("Failed to read database file, restoring defaults.", e);
    }
  }
  const defaultDB = {
    users: initialUsers,
    projects: initialProjects,
    notifications: initialNotifications,
  };
  saveDB(defaultDB);
  return defaultDB;
}

// Save Database
function saveDB(data: any) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) {
    console.error("Failed to write to database.json", e);
  }
}

// REST Endpoints
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Authentication
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  const db = loadDB();
  const user = db.users.find(
    (u: any) => u.username.toLowerCase() === username?.toLowerCase() && u.password === password
  );

  if (user) {
    res.json({ success: true, user: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl, role: user.role } });
  } else {
    res.status(401).json({ success: false, message: "Неверный логин или пароль" });
  }
});

app.post("/api/auth/register", (req, res) => {
  const { username, password, displayName } = req.body;
  if (!username || !password || !displayName) {
    return res.status(400).json({ success: false, message: "Заполните все поля" });
  }

  const db = loadDB();
  if (db.users.some((u: any) => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(400).json({ success: false, message: "Пользователь с таким логином уже существует" });
  }

  const newUser = {
    id: "user_" + Date.now(),
    username,
    password,
    displayName,
    avatarUrl: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(username)}`,
    role: "user" as const,
  };

  db.users.push(newUser);
  saveDB(db);

  res.json({ success: true, user: { id: newUser.id, username: newUser.username, displayName: newUser.displayName, avatarUrl: newUser.avatarUrl, role: newUser.role } });
});

// Projects
app.get("/api/projects", (req, res) => {
  const db = loadDB();
  res.json(db.projects);
});

app.get("/api/projects/:id", (req, res) => {
  const db = loadDB();
  const project = db.projects.find((p: any) => p.id === req.params.id);
  if (project) {
    res.json(project);
  } else {
    res.status(404).json({ message: "Проект не найден" });
  }
});

app.post("/api/projects", (req, res) => {
  const { title, type, coverUrl, tags, userId, username, displayName } = req.body;
  if (!title || !type) {
    return res.status(400).json({ message: "Укажите название и тип проекта" });
  }

  const db = loadDB();
  const newProject = {
    id: "project_" + Date.now(),
    title,
    type,
    coverUrl: coverUrl || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=400&h=400&q=80",
    tags: tags || [],
    participants: [
      {
        userId: userId || "user_admin",
        username: username || "admin",
        displayName: displayName || "Алексей (Producer)",
        role: "owner" as const,
      },
    ],
    tracks: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.projects.push(newProject);
  saveDB(db);
  res.status(201).json(newProject);
});

// Join Project via Invite Link
app.post("/api/projects/:id/join", (req, res) => {
  const { userId, username, displayName } = req.body;
  if (!userId || !username || !displayName) {
    return res.status(400).json({ message: "Недостаточно данных пользователя" });
  }

  const db = loadDB();
  const projectIndex = db.projects.findIndex((p: any) => p.id === req.params.id);

  if (projectIndex > -1) {
    const project = db.projects[projectIndex];
    const alreadyParticipant = project.participants.some((p: any) => p.userId === userId);

    if (!alreadyParticipant) {
      project.participants.push({
        userId,
        username,
        displayName,
        role: "editor" as const,
      });
      project.updatedAt = new Date().toISOString();

      // Create notification
      const newNotif = {
        id: "not_" + Date.now(),
        projectId: project.id,
        projectName: project.title,
        message: "присоединился к проекту по приглашению",
        author: displayName || username,
        timestamp: new Date().toISOString(),
        read: false,
      };
      db.notifications.unshift(newNotif);

      saveDB(db);
    }

    res.json(project);
  } else {
    res.status(404).json({ message: "Проект не найден" });
  }
});

app.put("/api/projects/:id", (req, res) => {
  const { title, type, coverUrl, tags, participants } = req.body;
  const db = loadDB();
  const projectIndex = db.projects.findIndex((p: any) => p.id === req.params.id);

  if (projectIndex > -1) {
    const updated = {
      ...db.projects[projectIndex],
      title: title ?? db.projects[projectIndex].title,
      type: type ?? db.projects[projectIndex].type,
      coverUrl: coverUrl ?? db.projects[projectIndex].coverUrl,
      tags: tags ?? db.projects[projectIndex].tags,
      participants: participants ?? db.projects[projectIndex].participants,
      updatedAt: new Date().toISOString(),
    };
    db.projects[projectIndex] = updated;
    saveDB(db);
    res.json(updated);
  } else {
    res.status(404).json({ message: "Проект не найден" });
  }
});

app.delete("/api/projects/:id", (req, res) => {
  const db = loadDB();
  const filtered = db.projects.filter((p: any) => p.id !== req.params.id);
  db.projects = filtered;
  saveDB(db);
  res.json({ success: true });
});

// Tracks Inside Projects
app.post("/api/projects/:projectId/tracks", (req, res) => {
  const { title, tags } = req.body;
  const db = loadDB();
  const projectIndex = db.projects.findIndex((p: any) => p.id === req.params.projectId);

  if (projectIndex > -1) {
    const newTrack = {
      id: "track_" + Date.now(),
      title: title || "Новый трек",
      lyrics: "[Куплет 1]\nНачните писать текст здесь...",
      tags: tags || ["В разработке"],
      versionHistory: [],
      audioVersions: [],
      comments: [],
      chat: [],
      tasks: [],
      annotations: [],
    };

    db.projects[projectIndex].tracks.push(newTrack);
    db.projects[projectIndex].updatedAt = new Date().toISOString();
    saveDB(db);
    res.status(201).json(newTrack);
  } else {
    res.status(404).json({ message: "Проект не найден" });
  }
});

// Update Track (Lyrics, title, tags)
app.put("/api/projects/:projectId/tracks/:trackId", (req, res) => {
  const { title, lyrics, tags, author, label, versionLabel } = req.body;
  const db = loadDB();
  const projectIndex = db.projects.findIndex((p: any) => p.id === req.params.projectId);

  if (projectIndex > -1) {
    const project = db.projects[projectIndex];
    const trackIndex = project.tracks.findIndex((t: any) => t.id === req.params.trackId);

    if (trackIndex > -1) {
      const track = project.tracks[trackIndex];

      // If lyrics are modified, check if we need to store a version history
      if (lyrics && lyrics !== track.lyrics) {
        const isSignificantEdit = versionLabel || track.versionHistory.length === 0;
        if (isSignificantEdit || Math.random() < 0.15) { // periodic auto-version
          const newVersion = {
            id: "ver_" + Date.now(),
            lyrics: track.lyrics,
            author: author || "Редактор",
            timestamp: new Date().toISOString(),
            label: versionLabel || label || `Автосохранение (${author || "Пользователь"})`,
          };
          track.versionHistory.push(newVersion);
        }
      }

      track.title = title ?? track.title;
      track.lyrics = lyrics ?? track.lyrics;
      track.tags = tags ?? track.tags;

      project.updatedAt = new Date().toISOString();
      saveDB(db);

      // Create notification for lyrics modification
      if (lyrics && lyrics !== track.lyrics) {
        const newNotif = {
          id: "not_" + Date.now(),
          projectId: project.id,
          projectName: project.title,
          trackId: track.id,
          trackName: track.title,
          message: "обновил текст песни",
          author: author || "Участник",
          timestamp: new Date().toISOString(),
          read: false,
        };
        db.notifications.unshift(newNotif);
        saveDB(db);
      }

      res.json(track);
    } else {
      res.status(404).json({ message: "Трек не найден" });
    }
  } else {
    res.status(404).json({ message: "Проект не найден" });
  }
});

// Add Audio Version (base64 file or link)
app.post("/api/projects/:projectId/tracks/:trackId/audio", (req, res) => {
  const { filename, size, url, isExternal, externalProvider, uploadedBy, fileBase64 } = req.body;
  const db = loadDB();
  const projectIndex = db.projects.findIndex((p: any) => p.id === req.params.projectId);

  if (projectIndex > -1) {
    const project = db.projects[projectIndex];
    const trackIndex = project.tracks.findIndex((t: any) => t.id === req.params.trackId);

    if (trackIndex > -1) {
      const track = project.tracks[trackIndex];
      let finalUrl = url;

      // Handle raw base64 upload
      if (!isExternal && fileBase64) {
        try {
          const fileBuffer = Buffer.from(fileBase64.split(",")[1] || fileBase64, "base64");
          const safeFilename = `${Date.now()}_${filename.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
          fs.writeFileSync(path.join(UPLOADS_DIR, safeFilename), fileBuffer);
          finalUrl = `/uploads/${safeFilename}`;
        } catch (uploadErr) {
          console.error("Failed to write uploaded file", uploadErr);
          return res.status(500).json({ message: "Ошибка при записи файла на сервер" });
        }
      }

      const versionNumber = track.audioVersions.length + 1;
      const newAudio = {
        id: "audio_" + Date.now(),
        filename: filename || "demo_track.mp3",
        size: size || "N/A",
        url: finalUrl,
        isExternal: !!isExternal,
        externalProvider: externalProvider || null,
        uploadedBy: uploadedBy || "Неизвестный",
        timestamp: new Date().toISOString(),
        versionNumber,
      };

      track.audioVersions.push(newAudio);
      project.updatedAt = new Date().toISOString();

      // Create notification
      const newNotif = {
        id: "not_" + Date.now(),
        projectId: project.id,
        projectName: project.title,
        trackId: track.id,
        trackName: track.title,
        message: `загрузил демоверсию #${versionNumber} "${filename}"`,
        author: uploadedBy || "Участник",
        timestamp: new Date().toISOString(),
        read: false,
      };
      db.notifications.unshift(newNotif);

      saveDB(db);
      res.status(201).json(newAudio);
    } else {
      res.status(404).json({ message: "Трек не найден" });
    }
  } else {
    res.status(404).json({ message: "Проект не найден" });
  }
});

// Comments (Lyrics-linked or general)
app.post("/api/projects/:projectId/tracks/:trackId/comments", (req, res) => {
  const { lineIndex, author, text } = req.body;
  if (!text) return res.status(400).json({ message: "Введите текст комментария" });

  const db = loadDB();
  const projectIndex = db.projects.findIndex((p: any) => p.id === req.params.projectId);

  if (projectIndex > -1) {
    const project = db.projects[projectIndex];
    const trackIndex = project.tracks.findIndex((t: any) => t.id === req.params.trackId);

    if (trackIndex > -1) {
      const track = project.tracks[trackIndex];
      const newComment = {
        id: "comm_" + Date.now(),
        lineIndex: lineIndex !== undefined ? Number(lineIndex) : undefined,
        author: author || "Гость",
        text,
        timestamp: new Date().toISOString(),
        resolved: false,
      };

      track.comments.push(newComment);
      project.updatedAt = new Date().toISOString();

      // Notification
      const newNotif = {
        id: "not_" + Date.now(),
        projectId: project.id,
        projectName: project.title,
        trackId: track.id,
        trackName: track.title,
        message: `оставил комментарий: "${text.substring(0, 30)}${text.length > 30 ? "..." : ""}"`,
        author: author || "Участник",
        timestamp: new Date().toISOString(),
        read: false,
      };
      db.notifications.unshift(newNotif);

      saveDB(db);
      res.status(201).json(newComment);
    } else {
      res.status(404).json({ message: "Трек не найден" });
    }
  } else {
    res.status(404).json({ message: "Проект не найден" });
  }
});

// Resolve Comment
app.put("/api/projects/:projectId/tracks/:trackId/comments/:commentId/resolve", (req, res) => {
  const db = loadDB();
  const projectIndex = db.projects.findIndex((p: any) => p.id === req.params.projectId);

  if (projectIndex > -1) {
    const project = db.projects[projectIndex];
    const trackIndex = project.tracks.findIndex((t: any) => t.id === req.params.trackId);

    if (trackIndex > -1) {
      const track = project.tracks[trackIndex];
      const commentIndex = track.comments.findIndex((c: any) => c.id === req.params.commentId);

      if (commentIndex > -1) {
        track.comments[commentIndex].resolved = !track.comments[commentIndex].resolved;
        project.updatedAt = new Date().toISOString();
        saveDB(db);
        res.json(track.comments[commentIndex]);
      } else {
        res.status(404).json({ message: "Комментарий не найден" });
      }
    } else {
      res.status(404).json({ message: "Трек не найден" });
    }
  } else {
    res.status(404).json({ message: "Проект не найден" });
  }
});

// Chat Room Message
app.post("/api/projects/:projectId/tracks/:trackId/chat", (req, res) => {
  const { author, text } = req.body;
  if (!text) return res.status(400).json({ message: "Введите текст сообщения" });

  const db = loadDB();
  const projectIndex = db.projects.findIndex((p: any) => p.id === req.params.projectId);

  if (projectIndex > -1) {
    const project = db.projects[projectIndex];
    const trackIndex = project.tracks.findIndex((t: any) => t.id === req.params.trackId);

    if (trackIndex > -1) {
      const track = project.tracks[trackIndex];
      const newMessage = {
        id: "chat_" + Date.now(),
        author: author || "Участник",
        text,
        timestamp: new Date().toISOString(),
      };

      track.chat.push(newMessage);
      project.updatedAt = new Date().toISOString();
      saveDB(db);
      res.status(201).json(newMessage);
    } else {
      res.status(404).json({ message: "Трек не найден" });
    }
  } else {
    res.status(404).json({ message: "Проект не найден" });
  }
});

// Tasks Board
app.post("/api/projects/:projectId/tracks/:trackId/tasks", (req, res) => {
  const { title, assignedTo } = req.body;
  if (!title) return res.status(400).json({ message: "Введите название задачи" });

  const db = loadDB();
  const projectIndex = db.projects.findIndex((p: any) => p.id === req.params.projectId);

  if (projectIndex > -1) {
    const project = db.projects[projectIndex];
    const trackIndex = project.tracks.findIndex((t: any) => t.id === req.params.trackId);

    if (trackIndex > -1) {
      const track = project.tracks[trackIndex];
      const newTask = {
        id: "task_" + Date.now(),
        title,
        status: "todo" as const,
        assignedTo,
        timestamp: new Date().toISOString(),
      };

      track.tasks.push(newTask);
      project.updatedAt = new Date().toISOString();
      saveDB(db);
      res.status(201).json(newTask);
    } else {
      res.status(404).json({ message: "Трек не найден" });
    }
  } else {
    res.status(404).json({ message: "Проект не найден" });
  }
});

// Update Task Status
app.put("/api/projects/:projectId/tracks/:trackId/tasks/:taskId", (req, res) => {
  const { status } = req.body;
  const db = loadDB();
  const projectIndex = db.projects.findIndex((p: any) => p.id === req.params.projectId);

  if (projectIndex > -1) {
    const project = db.projects[projectIndex];
    const trackIndex = project.tracks.findIndex((t: any) => t.id === req.params.trackId);

    if (trackIndex > -1) {
      const track = project.tracks[trackIndex];
      const taskIndex = track.tasks.findIndex((tk: any) => tk.id === req.params.taskId);

      if (taskIndex > -1) {
        track.tasks[taskIndex].status = status;
        project.updatedAt = new Date().toISOString();
        saveDB(db);
        res.json(track.tasks[taskIndex]);
      } else {
        res.status(404).json({ message: "Задача не найдена" });
      }
    } else {
      res.status(404).json({ message: "Трек не найден" });
    }
  } else {
    res.status(404).json({ message: "Проект не найден" });
  }
});

// Audio Timestamp Annotations
app.post("/api/projects/:projectId/tracks/:trackId/annotations", (req, res) => {
  const { timestampSeconds, text, author } = req.body;
  if (timestampSeconds === undefined || !text) {
    return res.status(400).json({ message: "Укажите таймкод и текст заметки" });
  }

  const db = loadDB();
  const projectIndex = db.projects.findIndex((p: any) => p.id === req.params.projectId);

  if (projectIndex > -1) {
    const project = db.projects[projectIndex];
    const trackIndex = project.tracks.findIndex((t: any) => t.id === req.params.trackId);

    if (trackIndex > -1) {
      const track = project.tracks[trackIndex];
      const newAnnotation = {
        id: "annot_" + Date.now(),
        timestampSeconds: Number(timestampSeconds),
        text,
        author: author || "Участник",
        createdAt: new Date().toISOString(),
      };

      track.annotations.push(newAnnotation);
      project.updatedAt = new Date().toISOString();
      saveDB(db);
      res.status(201).json(newAnnotation);
    } else {
      res.status(404).json({ message: "Трек не найден" });
    }
  } else {
    res.status(404).json({ message: "Проект не найден" });
  }
});

// Notifications
app.get("/api/notifications", (req, res) => {
  const db = loadDB();
  res.json(db.notifications);
});

app.post("/api/notifications/:id/read", (req, res) => {
  const db = loadDB();
  const notif = db.notifications.find((n: any) => n.id === req.params.id);
  if (notif) {
    notif.read = true;
    saveDB(db);
    res.json({ success: true });
  } else {
    res.status(404).json({ message: "Уведомление не найдено" });
  }
});

app.post("/api/notifications/read-all", (req, res) => {
  const db = loadDB();
  db.notifications.forEach((n: any) => (n.read = true));
  saveDB(db);
  res.json({ success: true });
});

// Gemini Rhymes & Lyric Suggestion
app.post("/api/gemini/rhymes", async (req, res) => {
  const { word, language = "Russian", context = "" } = req.body;
  if (!word) {
    return res.status(400).json({ message: "Введите слово для поиска рифмы" });
  }

  if (!ai) {
    // Fallback if no API key is set
    return res.json({
      word,
      rhymes: [
        "неон", "закон", "перрон", "флакон", "вагон", "звон", "сон", "тон", "он", "поклон",
        "дворец", "конец", "венец", "певец", "боец", "молодец", "гонец"
      ].slice(0, 10),
      suggestions: [
        "И в душе горит весенний этот звон",
        "Мы уедем далеко за горизонт, за неон",
        "Слышен тихий колокольный перезвон"
      ],
      fallback: true
    });
  }

  try {
    const prompt = `You are a professional songwriting assistant. Find excellent, natural, and artistic rhymes for the word: "${word}" in the ${language} language.
Also provide 3 beautiful, poetic, ready-to-use lyrical line suggestions that finish with these rhymes or include them in a poetic context.
${context ? `The target vibe of the song is: ${context}. Keep your suggestions aligned to this vibe.` : ""}
Return the response as a valid JSON object matching the requested schema. Use appropriate Cyrillic/English text depending on the language requested.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            word: { type: Type.STRING },
            rhymes: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "List of 10-15 great, precise rhymes for the word."
            },
            suggestions: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "3 complete, poetic song lines that incorporate the rhyming words smoothly and fit the mood."
            }
          },
          required: ["word", "rhymes", "suggestions"]
        }
      }
    });

    const resultText = response.text?.trim() || "{}";
    const result = JSON.parse(resultText);
    res.json(result);
  } catch (err) {
    console.error("Gemini API Error:", err);
    res.status(500).json({ message: "Ошибка при генерации рифм с помощью AI" });
  }
});

// Start Server and mount Vite middleware
async function startServer() {
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
