# **App Name**: VizAI Discovery Scanner

## Core Features:

- Secure Authentication & Role-Based Access: Enable user login/registration via email/password and enforce role-based access control (Admin, Client) for app features and data visibility, leveraging Firebase Authentication.
- Company & Project Profile Management: Allow users to create, view, and edit detailed company profiles including website, industry, target geography, service categories, and competitor listings. Stores data in Cloud Firestore.
- Mock AI Scan Engine: Initiate and generate deterministic, seeded mock scan results for a company profile, including simulated AI visibility scores, rankings, and 'missed opportunity' findings to act as an intelligence tool, storing these in Cloud Firestore.
- Interactive Scan Results & Comparison: Display polished scan results with visual scorecards, charts for category scores (e.g., Visibility, Accuracy, Citation Strength), and side-by-side competitor comparisons.
- Historical Scan Trends & Analytics: Visualize historical scan data for individual companies over time, presenting trend charts for overall scores and category-specific performance.
- Rules-Based Recommendations Tool: Generate actionable recommendations based on analysis of mock scan results and identified knowledge gaps, simulating strategic advice to improve AI discoverability.
- Admin Dashboard & Data Seeding: Provide administrators with a panel to manage organizations, user accounts, view system activity, and seed demo data or trigger sample scans.

## Style Guidelines:

- Primary color: A sophisticated, deep corporate blue (#174C80) for credibility and professionalism. Background color: A very light, subtly tinted blue (#F0F4F7) to maintain a clean, open feel. Accent color: A vibrant cyan-blue (#14C4E6) for calls to action and important highlights, providing visual contrast.
- Body and headline font: 'Inter' (sans-serif) for its modern, neutral, and highly readable qualities, suitable for B2B applications demanding clarity across dashboards and detailed reports.
- Utilize a consistent set of clean, minimalist line icons or filled icons. Focus on functionality and intuitive representation for navigation, data points, and actionable items, avoiding overly decorative styles.
- Employ a responsive, grid-based layout with a strong emphasis on card-style components for data organization. Leverage ample whitespace to ensure clear visual hierarchy and readability across dashboards and detailed reports, consistent with enterprise SaaS applications.
- Implement subtle and functional animations, such as smooth transitions for component state changes or route navigation. Animations should enhance user experience without being distracting or gimmicky, reflecting a 'production-minded' and 'strategic' aesthetic.