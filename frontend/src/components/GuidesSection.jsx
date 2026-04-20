import { Link } from "react-router-dom";

const guides = [
  {
    slug: "/best-ai-tools-for-students",
    emoji: "🎓",
    title: "Best AI Tools for Students",
    description: "Top 10 tools for essays, research, coding and staying organised.",
    badge: "Most popular",
    badgeColor: "#6366f1",
    color: "#6366f1",
  },
  {
    slug: "/best-free-ai-tools",
    emoji: "💸",
    title: "Best Free AI Tools",
    description: "10 powerful AI tools with genuinely useful free tiers. No credit card needed.",
    badge: "Free only",
    badgeColor: "#10a37f",
    color: "#10a37f",
  },
];

export function GuidesDropdown() {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: "4px",
      padding: "8px",
      minWidth: "260px",
    }}>
      <p style={{
        fontFamily: "system-ui, sans-serif",
        fontSize: "11px",
        color: "#475569",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        padding: "4px 8px",
        margin: 0,
      }}>Guides</p>
      {guides.map(g => (
        <Link key={g.slug} to={g.slug} style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "8px 10px",
          borderRadius: "8px",
          textDecoration: "none",
          transition: "background 0.15s",
        }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
        >
          <span style={{ fontSize: "1.1rem" }}>{g.emoji}</span>
          <div>
            <p style={{ fontFamily: "system-ui, sans-serif", fontSize: "13px", fontWeight: "600", color: "#e2e8f0", margin: 0 }}>{g.title}</p>
            <p style={{ fontFamily: "system-ui, sans-serif", fontSize: "11px", color: "#64748b", margin: 0 }}>{g.description}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

export default function GuidesSection() {
  return (
    <section style={{
      maxWidth: "1200px",
      margin: "0 auto",
      padding: "64px 24px",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "32px",
        flexWrap: "wrap",
        gap: "12px",
      }}>
        <div>
          <h2 style={{
            fontFamily: "'Georgia', serif",
            fontSize: "1.8rem",
            fontWeight: "700",
            color: "#f1f5f9",
            margin: "0 0 6px",
            letterSpacing: "-0.02em",
          }}>Student Guides</h2>
          <p style={{
            fontFamily: "system-ui, sans-serif",
            fontSize: "14px",
            color: "#64748b",
            margin: 0,
          }}>Curated picks for specific workflows</p>
        </div>
        <Link to="/tools" style={{
          fontFamily: "system-ui, sans-serif",
          fontSize: "13px",
          color: "#6366f1",
          textDecoration: "none",
          fontWeight: "600",
        }}>
          Browse all tools →
        </Link>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        gap: "16px",
      }}>
        {guides.map(g => (
          <Link key={g.slug} to={g.slug} style={{
            display: "block",
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderLeft: `3px solid ${g.color}`,
            borderRadius: "12px",
            padding: "24px",
            textDecoration: "none",
            transition: "background 0.2s, transform 0.2s",
          }}
            onMouseEnter={e => {
              e.currentTarget.style.background = "rgba(255,255,255,0.05)";
              e.currentTarget.style.transform = "translateY(-2px)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = "rgba(255,255,255,0.02)";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "12px" }}>
              <span style={{ fontSize: "1.8rem" }}>{g.emoji}</span>
              <span style={{
                fontFamily: "system-ui, sans-serif",
                fontSize: "11px",
                fontWeight: "600",
                background: `${g.badgeColor}20`,
                border: `1px solid ${g.badgeColor}40`,
                color: g.badgeColor,
                padding: "2px 10px",
                borderRadius: "999px",
              }}>{g.badge}</span>
            </div>
            <h3 style={{
              fontFamily: "'Georgia', serif",
              fontSize: "1.1rem",
              fontWeight: "700",
              color: "#f1f5f9",
              margin: "0 0 8px",
            }}>{g.title}</h3>
            <p style={{
              fontFamily: "system-ui, sans-serif",
              fontSize: "13px",
              color: "#64748b",
              margin: "0 0 16px",
              lineHeight: "1.6",
            }}>{g.description}</p>
            <span style={{
              fontFamily: "system-ui, sans-serif",
              fontSize: "13px",
              color: g.color,
              fontWeight: "600",
            }}>Read guide →</span>
          </Link>
        ))}
      </div>
    </section>
  );
}