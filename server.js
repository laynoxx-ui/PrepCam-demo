import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import sqlite3 from 'sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

// Middleware
app.use(cors({
    origin: (origin, callback) => {
        if (!origin) {
            return callback(null, true);
        }

        if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        callback(new Error(`CORS policy denied request from ${origin}`));
    },
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database setup
const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Database connection error:', err);
    } else {
        console.log('Connected to SQLite database');
    }
});

// Promisify database methods
function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve({ id: this.lastID, changes: this.changes });
        });
    });
}

function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

// Middleware to verify JWT
function verifyToken(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
}

// ==================== AUTH ROUTES ====================

app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, phone, password, role, school, class: userClass, examType, bio, age, gender, interests, subjects } = req.body;

        if (!name || !email || !password || !role) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const existing = await dbGet('SELECT id FROM users WHERE email = ?', [email]);
        if (existing) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const avatars = {
            'Student': '🧠',
            'Teacher': '👩‍🏫',
            'Parent': '👩‍🦱'
        };

        const result = await dbRun(
            `INSERT INTO users (name, email, phone, password, role, avatar, school, class, examType, bio, age, gender, interests, subjects, linkedStudents)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                name,
                email,
                phone || null,
                hashedPassword,
                role,
                avatars[role] || '👤',
                school || null,
                userClass || null,
                examType || null,
                bio || null,
                age || null,
                gender || null,
                interests || null,
                subjects ? JSON.stringify(subjects) : null,
                JSON.stringify([])
            ]
        );

        const user = await dbGet('SELECT id, name, email, role, avatar, phone, school, class, examType, bio, age, gender, interests, subjects FROM users WHERE id = ?', [result.id]);
        const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

        res.json({ user, token });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        const user = await dbGet('SELECT * FROM users WHERE email = ?', [email]);
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

        res.json({
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                avatar: user.avatar,
                school: user.school,
                class: user.class,
                examType: user.examType,
                bio: user.bio,
                age: user.age,
                gender: user.gender,
                interests: user.interests,
                subjects: user.subjects ? JSON.parse(user.subjects) : []
            },
            token
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

app.get('/api/auth/me', verifyToken, async (req, res) => {
    try {
        const user = await dbGet('SELECT id, name, email, phone, role, avatar, school, class, examType, bio, age, gender, interests, subjects, linkedStudents FROM users WHERE id = ?', [req.user.id]);
        if (user?.subjects) {
            user.subjects = JSON.parse(user.subjects);
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

// ==================== PROFILE ROUTES ====================

app.put('/api/profile', verifyToken, async (req, res) => {
    try {
        const { name, email, phone, school, class: userClass, examType, bio, age, gender, interests, avatar } = req.body;
        
        await dbRun(
            `UPDATE users SET name = ?, email = ?, phone = ?, school = ?, class = ?, examType = ?, bio = ?, age = ?, gender = ?, interests = ?, avatar = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
            [name, email, phone, school, userClass, examType, bio, age, gender, interests, avatar, req.user.id]
        );

        const user = await dbGet('SELECT id, name, email, phone, role, avatar, school, class, examType, bio, age, gender, interests FROM users WHERE id = ?', [req.user.id]);
        res.json(user);
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// Get user profile by ID
app.get('/api/users/:id', async (req, res) => {
    try {
        const userId = req.params.id;
        const user = await dbGet(
            `SELECT id, name, email, role, avatar, school, class, examType, bio, age, gender, interests FROM users WHERE id = ?`,
            [userId]
        );
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Get student stats if they're a student
        let stats = null;
        if (user.role === 'Student') {
            stats = await dbGet(
                `SELECT COUNT(DISTINCT examId) as examsCount, AVG(score) as avgScore, MAX(score) as bestScore 
                 FROM results WHERE studentId = ?`,
                [userId]
            );
        }

        res.json({ ...user, stats });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

// ==================== PARENT-STUDENT LINKING ====================

app.get('/api/parent/search-students', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'Parent') {
            return res.status(403).json({ error: 'Only parents can access this endpoint' });
        }

        const { query } = req.query;
        let sql = 'SELECT id, name, email, school, class, avatar FROM users WHERE role = "Student"';
        const params = [];

        if (query) {
            sql += ' AND (name LIKE ? OR email LIKE ?)';
            params.push(`%${query}%`, `%${query}%`);
        }

        const students = await dbAll(sql, params);
        res.json(students);
    } catch (error) {
        console.error('Search students error:', error);
        res.status(500).json({ error: 'Failed to search students' });
    }
});

app.post('/api/parent/link-student', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'Parent') {
            return res.status(403).json({ error: 'Only parents can link students' });
        }

        const { studentId } = req.body;
        const parentId = req.user.id;

        // Check if student exists
        const student = await dbGet('SELECT id FROM users WHERE id = ? AND role = "Student"', [studentId]);
        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        // Get parent's linked students
        const parent = await dbGet('SELECT linkedStudents FROM users WHERE id = ?', [parentId]);
        const linkedStudents = parent && parent.linkedStudents ? JSON.parse(parent.linkedStudents) : [];

        // Check if already linked
        if (linkedStudents.includes(studentId)) {
            return res.status(400).json({ error: 'Student already linked' });
        }

        // Add to linked students
        linkedStudents.push(studentId);
        await dbRun('UPDATE users SET linkedStudents = ? WHERE id = ?', [JSON.stringify(linkedStudents), parentId]);

        res.json({ success: true, linkedStudents });
    } catch (error) {
        console.error('Link student error:', error);
        res.status(500).json({ error: 'Failed to link student' });
    }
});

app.get('/api/parent/linked-students', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'Parent') {
            return res.status(403).json({ error: 'Only parents can access this endpoint' });
        }

        const parent = await dbGet('SELECT linkedStudents FROM users WHERE id = ?', [req.user.id]);
        if (!parent || !parent.linkedStudents) {
            return res.json([]);
        }

        const linkedStudentIds = JSON.parse(parent.linkedStudents);
        const students = await dbAll(
            `SELECT id, name, email, school, class, avatar FROM users WHERE id IN (${linkedStudentIds.map(() => '?').join(',')})`,
            linkedStudentIds
        );

        res.json(students);
    } catch (error) {
        console.error('Get linked students error:', error);
        res.status(500).json({ error: 'Failed to fetch linked students' });
    }
});

// ==================== EXAM ROUTES ====================

app.get('/api/exams', async (req, res) => {
    try {
        const exams = await dbAll(
            `SELECT e.*, u.name as createdByName FROM mockExams e 
             JOIN users u ON e.createdBy = u.id 
             ORDER BY e.createdAt DESC`
        );
        res.json(exams);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch exams' });
    }
});

app.get('/api/exams/:id', async (req, res) => {
    try {
        const exam = await dbGet(
            `SELECT e.*, u.name as createdByName FROM mockExams e 
             JOIN users u ON e.createdBy = u.id 
             WHERE e.id = ?`,
            [req.params.id]
        );
        if (!exam) {
            return res.status(404).json({ error: 'Exam not found' });
        }

        const questions = await dbAll('SELECT * FROM questions WHERE examId = ?', [req.params.id]);
        exam.questions = questions.map(q => ({
            ...q,
            options: JSON.parse(q.options)
        }));

        res.json(exam);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch exam' });
    }
});

app.post('/api/exams', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'Teacher') {
            return res.status(403).json({ error: 'Only teachers can create exams' });
        }

        const { title, description, subject, duration, totalQuestions, difficulty } = req.body;

        const result = await dbRun(
            `INSERT INTO mockExams (title, description, subject, duration, totalQuestions, difficulty, createdBy)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [title, description, subject, duration, totalQuestions, difficulty, req.user.id]
        );

        const exam = await dbGet('SELECT * FROM mockExams WHERE id = ?', [result.id]);
        res.json(exam);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create exam' });
    }
});

// ==================== QUESTION ROUTES ====================

app.get('/api/questions', async (req, res) => {
    try {
        const { subject, year, difficulty } = req.query;
        let sql = 'SELECT * FROM questions WHERE 1=1';
        const params = [];

        if (subject) {
            sql += ' AND subject = ?';
            params.push(subject);
        }
        if (year) {
            sql += ' AND year = ?';
            params.push(year);
        }
        if (difficulty) {
            sql += ' AND difficulty = ?';
            params.push(difficulty);
        }

        const questions = await dbAll(sql, params);
        res.json(questions.map(q => ({
            ...q,
            options: JSON.parse(q.options)
        })));
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch questions' });
    }
});

app.post('/api/questions', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'Teacher') {
            return res.status(403).json({ error: 'Only teachers can create questions' });
        }

        const { examId, subject, year, topic, text, options, correctAnswer, difficulty } = req.body;

        const result = await dbRun(
            `INSERT INTO questions (examId, subject, year, topic, text, options, correctAnswer, difficulty)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [examId, subject, year, topic, text, JSON.stringify(options), correctAnswer, difficulty]
        );

        const question = await dbGet('SELECT * FROM questions WHERE id = ?', [result.id]);
        res.json({
            ...question,
            options: JSON.parse(question.options)
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create question' });
    }
});

// ==================== EXAM SESSION ROUTES ====================

app.post('/api/exam-sessions', verifyToken, async (req, res) => {
    try {
        const { examId } = req.body;

        const result = await dbRun(
            `INSERT INTO examSessions (studentId, examId, status)
             VALUES (?, ?, 'in_progress')`,
            [req.user.id, examId]
        );

        const session = await dbGet('SELECT * FROM examSessions WHERE id = ?', [result.id]);
        res.json(session);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create exam session' });
    }
});

app.post('/api/exam-sessions/:id/submit', verifyToken, async (req, res) => {
    try {
        const { answers } = req.body;
        const sessionId = req.params.id;

        // Get session and exam
        const session = await dbGet('SELECT * FROM examSessions WHERE id = ? AND studentId = ?', [sessionId, req.user.id]);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const exam = await dbGet('SELECT * FROM mockExams WHERE id = ?', [session.examId]);
        const questions = await dbAll('SELECT * FROM questions WHERE examId = ?', [exam.id]);

        // Calculate score
        let correct = 0;
        questions.forEach((q, idx) => {
            if (answers[idx] === q.correctAnswer) {
                correct++;
            }
        });

        const score = Math.round((correct / questions.length) * 100);

        // Generate AI report
        const aiReport = generateAIReport(answers, questions, score);

        // Save result
        const result = await dbRun(
            `INSERT INTO results (studentId, examId, score, correct, total, aiReport)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [req.user.id, exam.id, score, correct, questions.length, JSON.stringify(aiReport)]
        );

        // Update session
        await dbRun(
            `UPDATE examSessions SET status = 'completed', endTime = CURRENT_TIMESTAMP, answers = ? WHERE id = ?`,
            [JSON.stringify(answers), sessionId]
        );

        // Create notification for parent if student has linked parents
        const studentId = req.user.id;
        const parents = await dbAll('SELECT id, name FROM users WHERE role = "Parent" AND linkedStudents IS NOT NULL', []);
        for (const parent of parents) {
            const linkedStudents = JSON.parse(parent.linkedStudents || '[]');
            if (linkedStudents.includes(studentId)) {
                await dbRun(
                    `INSERT INTO notifications (userId, type, title, content)
                     VALUES (?, 'exam_completed', ?, ?)`,
                    [parent.id, 'Exam Completed', `Your child completed ${exam.title} with a score of ${score}%`]
                );
            }
        }

        res.json({
            score,
            correct,
            total: questions.length,
            aiReport
        });
    } catch (error) {
        console.error('Submit exam error:', error);
        res.status(500).json({ error: 'Failed to submit exam' });
    }
});

// ==================== RESULTS ROUTES ====================

app.get('/api/results', verifyToken, async (req, res) => {
    try {
        let sql = 'SELECT r.*, e.title as examTitle FROM results r JOIN mockExams e ON r.examId = e.id WHERE 1=1';
        const params = [];

        if (req.user.role === 'Student') {
            sql += ' AND r.studentId = ?';
            params.push(req.user.id);
        } else if (req.user.role === 'Parent') {
            const parent = await dbGet('SELECT linkedStudents FROM users WHERE id = ?', [req.user.id]);
            const linkedStudentIds = parent && parent.linkedStudents ? JSON.parse(parent.linkedStudents) : [];

            if (linkedStudentIds.length === 0) {
                return res.json([]);
            }

            sql += ` AND r.studentId IN (${linkedStudentIds.map(() => '?').join(',')})`;
            params.push(...linkedStudentIds);
        } else {
            sql += ' AND 0';
        }

        sql += ' ORDER BY r.completedAt DESC';

        const results = await dbAll(sql, params);
        res.json(results.map(r => ({
            ...r,
            aiReport: r.aiReport ? JSON.parse(r.aiReport) : null
        })));
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch results' });
    }
});

// ==================== COMMUNITY ROUTES ==================== 

app.get('/api/community/posts', async (req, res) => {
    try {
        const posts = await dbAll(
            `SELECT p.*, u.name as authorName, u.role, u.avatar FROM communityPosts p 
             JOIN users u ON p.authorId = u.id 
             ORDER BY p.createdAt DESC`
        );
        
        const postsWithComments = await Promise.all(posts.map(async (post) => {
            const comments = await dbAll(
                `SELECT c.*, u.name as authorName, u.role FROM comments c 
                 JOIN users u ON c.authorId = u.id 
                 WHERE c.postId = ? 
                 ORDER BY c.createdAt ASC`,
                [post.id]
            );
            return { ...post, comments };
        }));

        res.json(postsWithComments);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch posts' });
    }
});

app.post('/api/community/posts', verifyToken, async (req, res) => {
    try {
        const { title, content } = req.body;

        const result = await dbRun(
            `INSERT INTO communityPosts (authorId, title, content)
             VALUES (?, ?, ?)`,
            [req.user.id, title, content]
        );

        const post = await dbGet(
            `SELECT p.*, u.name as authorName, u.role, u.avatar FROM communityPosts p 
             JOIN users u ON p.authorId = u.id 
             WHERE p.id = ?`,
            [result.id]
        );

        res.json({ ...post, comments: [] });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create post' });
    }
});

app.post('/api/community/posts/:id/comments', verifyToken, async (req, res) => {
    try {
        const { content } = req.body;
        const postId = req.params.id;

        const result = await dbRun(
            `INSERT INTO comments (postId, authorId, content)
             VALUES (?, ?, ?)`,
            [postId, req.user.id, content]
        );

        const comment = await dbGet(
            `SELECT c.*, u.name as authorName, u.role FROM comments c 
             JOIN users u ON c.authorId = u.id 
             WHERE c.id = ?`,
            [result.id]
        );

        res.json(comment);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create comment' });
    }
});

app.post('/api/community/posts/:id/like', verifyToken, async (req, res) => {
    try {
        const postId = req.params.id;
        await dbRun('UPDATE communityPosts SET likes = likes + 1 WHERE id = ?', [postId]);
        const post = await dbGet('SELECT * FROM communityPosts WHERE id = ?', [postId]);
        res.json(post);
    } catch (error) {
        res.status(500).json({ error: 'Failed to like post' });
    }
});

// ==================== PARENT ROUTES ====================

app.get('/api/parent/child-data', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'Parent') {
            return res.status(403).json({ error: 'Only parents can access this endpoint' });
        }

        const parent = await dbGet('SELECT linkedStudents FROM users WHERE id = ?', [req.user.id]);
        if (!parent || !parent.linkedStudents) {
            return res.json({ student: null, results: [], exams: [] });
        }

        const linkedStudentIds = JSON.parse(parent.linkedStudents);
        if (linkedStudentIds.length === 0) {
            return res.json({ student: null, results: [], exams: [] });
        }

        // Get the first linked student (simplified for demo)
        const studentId = linkedStudentIds[0];
        const student = await dbGet('SELECT id, name, email, school, class, examType FROM users WHERE id = ?', [studentId]);

        if (!student) {
            return res.json({ student: null, results: [], exams: [] });
        }

        // Get student's results
        const results = await dbAll(
            `SELECT r.*, e.title as examTitle FROM results r 
             JOIN mockExams e ON r.examId = e.id 
             WHERE r.studentId = ? 
             ORDER BY r.completedAt DESC`,
            [studentId]
        );

        // Get available exams
        const exams = await dbAll('SELECT * FROM mockExams');

        res.json({
            student,
            results: results.map(r => ({
                ...r,
                aiReport: r.aiReport ? JSON.parse(r.aiReport) : null
            })),
            exams
        });
    } catch (error) {
        console.error('Parent child data error:', error);
        res.status(500).json({ error: 'Failed to fetch child data' });
    }
});

// ==================== NOTIFICATIONS ROUTES ====================

app.get('/api/notifications', verifyToken, async (req, res) => {
    try {
        const notifications = await dbAll(
            'SELECT * FROM notifications WHERE userId = ? ORDER BY createdAt DESC',
            [req.user.id]
        );
        res.json(notifications);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

app.post('/api/notifications/:id/read', verifyToken, async (req, res) => {
    try {
        await dbRun('UPDATE notifications SET read = 1 WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to mark notification as read' });
    }
});

// ==================== HELPER FUNCTIONS ====================

function generateAIReport(answers, questions, score) {
    const weakTopics = [];
    const strongTopics = [];
    const topicPerformance = {};

    questions.forEach((q, index) => {
        const topic = q.topic;
        if (!topicPerformance[topic]) {
            topicPerformance[topic] = { correct: 0, total: 0 };
        }
        topicPerformance[topic].total++;

        if (answers[index] === q.correctAnswer) {
            topicPerformance[topic].correct++;
        }
    });

    Object.entries(topicPerformance).forEach(([topic, perf]) => {
        const percentage = (perf.correct / perf.total) * 100;
        if (percentage < 50) {
            weakTopics.push(topic);
        } else if (percentage === 100) {
            strongTopics.push(topic);
        }
    });

    const recommendations = [];
    if (score >= 80) {
        recommendations.push('Excellent performance! You have a strong grasp of the material.');
        recommendations.push('Focus on the few weak areas to achieve perfection.');
        recommendations.push('Consider helping other students understand these concepts.');
    } else if (score >= 60) {
        recommendations.push('Good performance! You understand most concepts.');
        recommendations.push(`Focus on improving: ${weakTopics.join(', ')}`);
        recommendations.push('Review practice problems in weak areas.');
    } else {
        recommendations.push('You need more practice. Review the fundamentals.');
        recommendations.push(`Priority topics to study: ${weakTopics.join(', ')}`);
        recommendations.push('Consider forming a study group with classmates.');
    }

    return {
        score,
        strongTopics: strongTopics.length > 0 ? strongTopics : ['Review needed'],
        weakTopics: weakTopics.length > 0 ? weakTopics : ['None - Great job!'],
        recommendations,
        topicBreakdown: topicPerformance
    };
}

// Serve frontend static files when a built frontend exists
const frontendDistPath = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(frontendDistPath)) {
    app.use(express.static(frontendDistPath));

    app.get('*', (req, res) => {
        res.sendFile(path.join(frontendDistPath, 'index.html'));
    });
}

// ==================== ERROR HANDLING ====================

app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// ==================== START SERVER ====================

app.listen(PORT, () => {
    console.log(`PrepCam Backend running on http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Allowed CORS origins: ${allowedOrigins.join(', ')}`);
});

export default app;
