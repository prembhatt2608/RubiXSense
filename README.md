<div align="center">

# 🧩 RubiXSense

**AI-powered Rubik's Cube scanner and solver — point your camera, get the solution.**

![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.100%2B-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Three.js](https://img.shields.io/badge/Three.js-0.186-black?style=for-the-badge&logo=threedotjs&logoColor=white)
![OpenCV](https://img.shields.io/badge/OpenCV-4.8%2B-5C3EE8?style=for-the-badge&logo=opencv&logoColor=white)

</div>

---

## ✨ Features

- 📸 **Camera Scanning** — Capture each face of your cube using your webcam; OpenCV detects and classifies sticker colors automatically
- 🎨 **Manual Net Editor** — Drag-and-drop color picker to manually set or correct any face
- 🧠 **Intelligent Solver** — Generates an optimal move sequence using the Kociemba-style algorithm
- 🎲 **3D Visualization** — Real-time, interactive Three.js 3D cube that animates every solution step
- ✅ **State Validation** — Deep validation of cube state including corner/edge orientation and permutation parity
- 🔀 **Scramble Generator** — One-click random scramble with live 3D preview
- 🚀 **REST API** — Full FastAPI backend with Swagger UI at `/docs`

---

## 🏗️ Architecture

```
RubiXSense/
├── backend/                  # Python / FastAPI
│   ├── app/
│   │   ├── api/
│   │   │   ├── cube.py       # Validate, solve, simulate, scramble endpoints
│   │   │   └── scan.py       # Camera face-scan endpoint
│   │   ├── cube/
│   │   │   ├── state.py      # CubeState model & move application
│   │   │   ├── solver.py     # Rubik's cube solver integration
│   │   │   ├── validator.py  # Deep state validation
│   │   │   └── notation.py   # Move notation parser (R, U', F2 …)
│   │   ├── vision/
│   │   │   ├── sticker_detector.py   # OpenCV sticker grid detection
│   │   │   └── color_classifier.py  # HSV-based color classification
│   │   ├── schemas/          # Pydantic request/response models
│   │   └── main.py           # FastAPI app entry point
│   ├── tests/
│   └── requirements.txt
│
└── frontend/                 # React / Vite
    └── src/
        ├── components/
        │   ├── Cube3D.jsx         # Three.js 3D cube renderer & animator
        │   ├── CubeNetEditor.jsx  # 2D face color editor
        │   ├── ScannerModal.jsx   # Webcam capture flow
        │   ├── SolutionViewer.jsx # Step-by-step move display
        │   └── Header.jsx
        ├── services/
        │   └── api.js             # Backend API client
        └── App.jsx
```

---

## 🚀 Getting Started

### Prerequisites

| Tool | Version |
|------|---------|
| Python | 3.10+ |
| Node.js | 18+ |
| npm | 9+ |
| A webcam | (optional, manual entry also works) |

---

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/RubiXSense.git
cd RubiXSense
```

---

### 2. Backend Setup

```bash
cd backend

# Create and activate a virtual environment
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the server
uvicorn app.main:app --reload --port 8000
```

The API will be live at **http://localhost:8000**  
Swagger docs at **http://localhost:8000/docs**

---

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start the dev server
npm run dev
```

The app will open at **http://localhost:5173**

---

## 📡 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Backend health check |
| `POST` | `/api/scan/face` | Upload a face image for color detection |
| `POST` | `/api/cube/validate` | Validate a 54-char facelet string |
| `POST` | `/api/cube/solve` | Solve the cube, returns move sequence |
| `POST` | `/api/cube/simulate` | Simulate applying moves to a state |
| `POST` | `/api/cube/from-faces` | Convert face color grids to facelet string |
| `GET/POST` | `/api/cube/scramble` | Generate a random scramble |

> Full interactive docs available at `/docs` (Swagger UI) or `/redoc`.

### Facelet String Format

The cube state is represented as a **54-character string** using the standard color notation:

```
U = Up (White)    D = Down (Yellow)
R = Right (Red)   L = Left (Orange)
F = Front (Green) B = Back (Blue)
```

Face order: `U(9) R(9) F(9) D(9) L(9) B(9)`

---

## 🛠️ Tech Stack

### Backend
- **[FastAPI](https://fastapi.tiangolo.com/)** — High-performance async REST API
- **[OpenCV](https://opencv.org/)** — Computer vision for sticker detection
- **[NumPy](https://numpy.org/)** — Numerical processing for color analysis
- **[Pydantic v2](https://docs.pydantic.dev/)** — Data validation & serialization
- **[rubik-solver](https://pypi.org/project/rubik-solver/)** — Pure Python cube solving

### Frontend
- **[React 19](https://react.dev/)** — UI framework
- **[Vite](https://vitejs.dev/)** — Lightning-fast dev server & bundler
- **[Three.js](https://threejs.org/)** — 3D cube rendering and move animation
- **[Lucide React](https://lucide.dev/)** — Icon library
- **[canvas-confetti](https://github.com/catdad/canvas-confetti)** — Celebration animation 🎉

---

## 🧪 Running Tests

```bash
cd backend
pytest tests/ -v
```

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<div align="center">
  Made with ❤️ by <a href="https://github.com/YOUR_USERNAME">Prem</a>
</div>
