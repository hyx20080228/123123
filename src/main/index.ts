import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

interface Project {
  id: string;
  name: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  filePath: string;
}

class ProjectManager {
  private projectsDir: string;
  private projects: Project[] = [];

  constructor(projectsDir: string) {
    this.projectsDir = projectsDir;
    this.loadProjects();
  }

  private loadProjects(): void {
    try {
      if (!fs.existsSync(this.projectsDir)) {
        fs.mkdirSync(this.projectsDir, { recursive: true });
        return;
      }
      const files = fs.readdirSync(this.projectsDir);
      this.projects = [];
      for (const file of files) {
        if (file.endsWith('.msp')) {
          try {
            const filePath = path.join(this.projectsDir, file);
            const content = fs.readFileSync(filePath, 'utf-8');
            const project: Project = JSON.parse(content);
            this.projects.push(project);
          } catch (error) {
            console.error(`Error reading project file: ${file}`, error);
          }
        }
      }
    } catch (error) {
      console.error('Error loading projects:', error);
      this.projects = [];
    }
  }

  getProjects(): Project[] {
    return [...this.projects];
  }

  createProject(name: string, author: string): Project {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const fileName = `${name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}_${id}.msp`;
    const filePath = path.join(this.projectsDir, fileName);
    const project: Project = {
      id,
      name,
      author,
      createdAt: now,
      updatedAt: now,
      filePath,
    };
    fs.writeFileSync(filePath, JSON.stringify(project, null, 2), 'utf-8');
    this.projects.unshift(project);
    return project;
  }

  openProject(projectId: string): Project {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    if (fs.existsSync(project.filePath)) {
      const content = fs.readFileSync(project.filePath, 'utf-8');
      const updatedProject: Project = JSON.parse(content);
      return updatedProject;
    }
    throw new Error(`Project file not found: ${project.filePath}`);
  }

  saveProject(project: Project): void {
    const index = this.projects.findIndex(p => p.id === project.id);
    if (index !== -1) {
      project.updatedAt = new Date().toISOString();
      this.projects[index] = project;
      fs.writeFileSync(project.filePath, JSON.stringify(project, null, 2), 'utf-8');
    } else {
      throw new Error(`Project not found: ${project.id}`);
    }
  }

  deleteProject(projectId: string): void {
    const index = this.projects.findIndex(p => p.id === projectId);
    if (index !== -1) {
      const project = this.projects[index];
      if (fs.existsSync(project.filePath)) {
        fs.unlinkSync(project.filePath);
      }
      this.projects.splice(index, 1);
    } else {
      throw new Error(`Project not found: ${projectId}`);
    }
  }
}

let mainWindow: BrowserWindow | null = null;
let projectManager: ProjectManager;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false
    },
    title: 'My Story Studio - 我的故事工作室',
    show: false
  });

  // 等待页面加载完成后再显示窗口
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  // 加载HTML文件
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // 开发者工具（可选）
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

const initProjectManager = () => {
  const projectsDir = path.join(app.getPath('documents'), 'MyStoryStudio', 'projects');
  if (!fs.existsSync(projectsDir)) {
    fs.mkdirSync(projectsDir, { recursive: true });
  }
  projectManager = new ProjectManager(projectsDir);
};

// 注册IPC处理程序
ipcMain.handle('get-projects', async () => projectManager.getProjects());
ipcMain.handle('create-project', async (_, data: { name: string; author: string }) => {
  try {
    const project = projectManager.createProject(data.name, data.author);
    return { success: true, project };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});
ipcMain.handle('open-project', async (_, projectId: string) => {
  try {
    const project = projectManager.openProject(projectId);
    return { success: true, project };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});
ipcMain.handle('save-project', async (_, project: Project) => {
  try {
    projectManager.saveProject(project);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});
ipcMain.handle('delete-project', async (_, projectId: string) => {
  try {
    projectManager.deleteProject(projectId);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

app.whenReady().then(() => {
  initProjectManager();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// 错误处理
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
