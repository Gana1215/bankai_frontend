from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Preformatted, ListFlowable, ListItem

# Create PDF file
pdf_path = "/mnt/data/Tailwind_Setup_BankAI.pdf"
doc = SimpleDocTemplate(pdf_path, pagesize=A4, title="TailwindCSS Setup for React + Vite (BankAI Edition)")
styles = getSampleStyleSheet()
content = []

# Title
title_style = ParagraphStyle('title', parent=styles['Title'], textColor=colors.HexColor("#2563EB"), fontSize=22, leading=26)
content.append(Paragraph("💠 TailwindCSS Setup for React + Vite (BankAI Edition)", title_style))
content.append(Spacer(1, 12))

# Section 1: Environment Setup
content.append(Paragraph("1️⃣ Environment Setup", styles['Heading2']))
content.append(Paragraph("Ensure Node.js and npm/yarn are installed:", styles['Normal']))
content.append(Preformatted("node -v\nnpm -v", styles['Code']))
content.append(Paragraph("Then create a new Vite + React app:", styles['Normal']))
content.append(Preformatted("npm create vite@latest my-bankai-frontend -- --template react\ncd my-bankai-frontend", styles['Code']))
content.append(Spacer(1, 10))

# Section 2: Install TailwindCSS
content.append(Paragraph("2️⃣ Install TailwindCSS", styles['Heading2']))
content.append(Preformatted("npm install -D tailwindcss postcss autoprefixer\nnpx tailwindcss init -p", styles['Code']))
content.append(Spacer(1, 10))

# Section 3: Configure Tailwind
content.append(Paragraph("3️⃣ Configure Tailwind", styles['Heading2']))
content.append(Paragraph("Edit your tailwind.config.js as follows:", styles['Normal']))
content.append(Preformatted("""export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: { extend: {} },
  plugins: [],
}""", styles['Code']))
content.append(Paragraph("And update src/index.css:", styles['Normal']))
content.append(Preformatted("""@tailwind base;
@tailwind components;
@tailwind utilities;""", styles['Code']))
content.append(Spacer(1, 10))

# Section 4: Add Custom Animations
content.append(Paragraph("4️⃣ Add Gradient Backgrounds + Custom Animations", styles['Heading2']))
content.append(Preformatted("""<style>
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
.animate-fade { animation: fadeIn 0.6s ease-in-out; }
@keyframes slideUp {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-slide-up { animation: slideUp 0.7s ease-out; }
</style>""", styles['Code']))
content.append(Spacer(1, 10))

# Section 5: Run & Test
content.append(Paragraph("5️⃣ Run & Test Your Project", styles['Heading2']))
content.append(Preformatted("npm run dev\n# open http://localhost:5173", styles['Code']))
content.append(Spacer(1, 10))

# Section 6: Build for Deployment
content.append(Paragraph("6️⃣ Build for Deployment", styles['Heading2']))
content.append(Preformatted("npm run build", styles['Code']))
content.append(Spacer(1, 10))

# Section 7: Bonus Tips
content.append(Paragraph("7️⃣ Bonus Tips", styles['Heading2']))
bonus_list = ListFlowable([
    ListItem(Paragraph("Use plugins like @tailwindcss/forms and @tailwindcss/typography for UI consistency.", styles['Normal'])),
    ListItem(Paragraph("Try color palettes: from-blue-50 via-teal-50 to-white for modern fintech look.", styles['Normal'])),
    ListItem(Paragraph("Save components like RecorderButton, ReplyCard, ToastBox as reusable modules.", styles['Normal']))
], bulletType='bullet')
content.append(bonus_list)

content.append(Spacer(1, 16))
content.append(Paragraph("☕ Crafted by Prof for Student Ganaa — Tailwind magic, BankAI style 💙", ParagraphStyle('footer', parent=styles['Normal'], alignment=1, textColor=colors.HexColor("#2563EB"))))

doc.build(content)
pdf_path
