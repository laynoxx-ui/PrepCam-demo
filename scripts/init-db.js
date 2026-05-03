import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../database.db');

// Remove existing database if it exists
if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    console.log('Removed existing database');
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error creating database:', err);
        process.exit(1);
    }
    console.log('Database created successfully');
});

db.serialize(() => {
    // Users table
    db.run(`
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            phone TEXT,
            password TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('Student', 'Teacher', 'Parent', 'Admin')),
            avatar TEXT,
            school TEXT,
            class TEXT,
            examType TEXT,
            subjects TEXT,
            bio TEXT,
            age INTEGER,
            gender TEXT,
            interests TEXT,
            linkedStudents TEXT,
            verified INTEGER DEFAULT 0,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Mock Exams table
    db.run(`
        CREATE TABLE mockExams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            subject TEXT NOT NULL,
            duration INTEGER NOT NULL,
            totalQuestions INTEGER NOT NULL,
            difficulty TEXT NOT NULL,
            createdBy INTEGER NOT NULL,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (createdBy) REFERENCES users(id)
        )
    `);

    // Questions table
    db.run(`
        CREATE TABLE questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            examId INTEGER,
            subject TEXT NOT NULL,
            year INTEGER NOT NULL,
            topic TEXT NOT NULL,
            text TEXT NOT NULL,
            options TEXT NOT NULL,
            correctAnswer INTEGER NOT NULL,
            difficulty TEXT NOT NULL,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (examId) REFERENCES mockExams(id)
        )
    `);

    // Exam Sessions table
    db.run(`
        CREATE TABLE examSessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            studentId INTEGER NOT NULL,
            examId INTEGER NOT NULL,
            startTime DATETIME DEFAULT CURRENT_TIMESTAMP,
            endTime DATETIME,
            status TEXT DEFAULT 'in_progress' CHECK(status IN ('in_progress', 'completed', 'abandoned')),
            answers TEXT,
            FOREIGN KEY (studentId) REFERENCES users(id),
            FOREIGN KEY (examId) REFERENCES mockExams(id)
        )
    `);

    // Results table
    db.run(`
        CREATE TABLE results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            studentId INTEGER NOT NULL,
            examId INTEGER NOT NULL,
            score REAL NOT NULL,
            correct INTEGER NOT NULL,
            total INTEGER NOT NULL,
            aiReport TEXT,
            completedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (studentId) REFERENCES users(id),
            FOREIGN KEY (examId) REFERENCES mockExams(id)
        )
    `);

    // Community Posts table
    db.run(`
        CREATE TABLE communityPosts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            authorId INTEGER NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            likes INTEGER DEFAULT 0,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (authorId) REFERENCES users(id)
        )
    `);

    // Comments table
    db.run(`
        CREATE TABLE comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            postId INTEGER NOT NULL,
            authorId INTEGER NOT NULL,
            content TEXT NOT NULL,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (postId) REFERENCES communityPosts(id),
            FOREIGN KEY (authorId) REFERENCES users(id)
        )
    `);

    // Notifications table
    db.run(`
        CREATE TABLE notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER NOT NULL,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            content TEXT,
            read INTEGER DEFAULT 0,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (userId) REFERENCES users(id)
        )
    `);

    // Weakness Tags table
    db.run(`
        CREATE TABLE weaknessTags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            studentId INTEGER NOT NULL,
            topic TEXT NOT NULL,
            frequency INTEGER DEFAULT 1,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (studentId) REFERENCES users(id)
        )
    `, () => {
        console.log('All tables created successfully');
        insertSampleData();
    });
});

function insertSampleData() {
    console.log('Inserting sample data...');

    // Sample users
    const users = [
        {
            name: 'John Student',
            email: 'student@prepcam.cm',
            phone: '+237123456789',
            password: '$2a$10$YIjlrHxVkSvKCqJwfKQjJuKQPKwQqKQqKQqKQqKQqKQqKQqKQqKQq', // password123
            role: 'Student',
            avatar: '👨‍🎓',
            school: 'Lycée de Yaoundé',
            class: 'Terminale C',
            examType: 'GCE A-Level'
        },
        {
            name: 'Dr. Sarah Johnson',
            email: 'teacher@prepcam.cm',
            phone: '+237987654321',
            password: '$2a$10$YIjlrHxVkSvKCqJwfKQjJuKQPKwQqKQqKQqKQqKQqKQqKQqKQqKQq', // password123
            role: 'Teacher',
            avatar: '👩‍🏫',
            subjects: JSON.stringify(['Mathematics', 'Physics']),
            verified: 1
        },
        {
            name: 'Mary Parent',
            email: 'parent@prepcam.cm',
            phone: '+237555666777',
            password: '$2a$10$YIjlrHxVkSvKCqJwfKQjJuKQPKwQqKQqKQqKQqKQqKQqKQqKQqKQq', // password123
            role: 'Parent',
            avatar: '👩‍🦱',
            linkedStudents: JSON.stringify([1])
        }
    ];

    db.serialize(() => {
        users.forEach((user, index) => {
            db.run(
                `INSERT INTO users (name, email, phone, password, role, avatar, school, class, examType, subjects, linkedStudents, verified)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [user.name, user.email, user.phone, user.password, user.role, user.avatar, user.school || null, user.class || null, user.examType || null, user.subjects || null, user.linkedStudents || null, user.verified || 0]
            );
        });

        // Sample mock exams
        const exams = [
            {
                title: 'Mathematics Final Exam 2024',
                description: 'Comprehensive exam covering Calculus, Algebra, and Geometry',
                subject: 'Mathematics',
                duration: 120,
                totalQuestions: 40,
                difficulty: 'Medium',
                createdBy: 2
            },
            {
                title: 'Physics Midterm Exam',
                description: 'Test your knowledge of Mechanics and Thermodynamics',
                subject: 'Physics',
                duration: 90,
                totalQuestions: 30,
                difficulty: 'Hard',
                createdBy: 2
            }
        ];

        exams.forEach(exam => {
            db.run(
                `INSERT INTO mockExams (title, description, subject, duration, totalQuestions, difficulty, createdBy)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [exam.title, exam.description, exam.subject, exam.duration, exam.totalQuestions, exam.difficulty, exam.createdBy]
            );
        });

        // Sample questions
        const questions = [
            {
                examId: 1,
                subject: 'Mathematics',
                year: 2024,
                topic: 'Calculus',
                text: 'Find the derivative of f(x) = 3x² + 2x + 1',
                options: JSON.stringify(['6x + 2', '3x + 2', '6x² + 2x', '9x + 2']),
                correctAnswer: 0,
                difficulty: 'Medium'
            },
            {
                examId: 1,
                subject: 'Mathematics',
                year: 2024,
                topic: 'Algebra',
                text: 'Solve for x: 2x + 5 = 13',
                options: JSON.stringify(['x = 4', 'x = 3', 'x = 5', 'x = 6']),
                correctAnswer: 0,
                difficulty: 'Easy'
            },
            {
                examId: 2,
                subject: 'Physics',
                year: 2023,
                topic: 'Mechanics',
                text: 'What is the SI unit of force?',
                options: JSON.stringify(['Newton', 'Joule', 'Watt', 'Pascal']),
                correctAnswer: 0,
                difficulty: 'Easy'
            },
            {
                examId: 2,
                subject: 'Physics',
                year: 2023,
                topic: 'Thermodynamics',
                text: 'At what temperature do Celsius and Fahrenheit scales coincide?',
                options: JSON.stringify(['-40°', '0°', '-273°', '100°']),
                correctAnswer: 0,
                difficulty: 'Hard'
            }
        ];

        questions.forEach(q => {
            db.run(
                `INSERT INTO questions (examId, subject, year, topic, text, options, correctAnswer, difficulty)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [q.examId, q.subject, q.year, q.topic, q.text, q.options, q.correctAnswer, q.difficulty]
            );
        });

        // Sample community posts
        db.run(
            `INSERT INTO communityPosts (authorId, title, content, likes)
             VALUES (?, ?, ?, ?)`,
            [1, 'Tips for solving calculus problems', 'I found that breaking down complex derivatives into smaller steps really helps. Always remember the chain rule!', 12]
        );

        db.run(
            `INSERT INTO communityPosts (authorId, title, content, likes)
             VALUES (?, ?, ?, ?)`,
            [2, 'New mock exam available', 'I\'ve uploaded a new comprehensive Mathematics exam covering all topics from this semester. Good luck!', 28],
            () => {
                console.log('Sample data inserted successfully');
                db.close();
                process.exit(0);
            }
        );
    });
}
