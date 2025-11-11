import { useAuth } from "@clerk/clerk-react";
import { useState, useEffect } from "react";
import "./Analytics.css";

function Analytics() {
  const { getToken } = useAuth();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadAnalytics();
  }, []);

  async function loadAnalytics() {
    try {
      setLoading(true);
      setError(null);

      // Get JWT token from Clerk
      const token = await getToken();
      if (!token) {
        throw new Error("No authentication token available");
      }

      console.log("Token received, length:", token.length);
      console.log("Token preview:", token.substring(0, 50) + "...");

      // Try to decode token to see what's in it
      try {
        const parts = token.split(".");
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1]));
          console.log("Token payload:", {
            sub: payload.sub,
            exp: payload.exp,
            iss: payload.iss,
            iat: payload.iat,
            now: Math.floor(Date.now() / 1000),
            expired: payload.exp
              ? payload.exp < Math.floor(Date.now() / 1000)
              : "no exp",
          });
        }
      } catch (e) {
        console.warn("Could not decode token:", e);
      }

      // In development, use proxy. In production, use relative path
      const response = await fetch("/api/analytics", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 401) {
        const errorData = await response
          .json()
          .catch(() => ({ message: "Unauthorized" }));
        throw new Error(
          errorData.message || "Unauthorized. Please sign in again."
        );
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to load analytics: ${response.statusText} - ${errorText}`
        );
      }

      const data = await response.json();
      setAnalytics(data);
    } catch (err) {
      console.error("Error loading analytics:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="analytics-container">
        <div className="loading">Loading analytics data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="analytics-container">
        <div className="error-message">
          <h3>Error</h3>
          <p>{error}</p>
          <button onClick={loadAnalytics}>Retry</button>
        </div>
      </div>
    );
  }

  const entries = Object.entries(analytics || {});
  // Handle both old format (just count) and new format (object with count, title, url)
  const totalClicks = entries.reduce((sum, [_, data]) => {
    const count = typeof data === 'number' ? data : (data?.count || 0);
    return sum + count;
  }, 0);
  const totalLinks = entries.length;
  const avgClicks = totalLinks > 0 ? Math.round(totalClicks / totalLinks) : 0;

  return (
    <div className="analytics-container">
      <div className="content">
        {entries.length === 0 ? (
          <div className="no-data">
            <div className="no-data-icon">📭</div>
            <h3>No analytics data yet</h3>
            <p>Start clicking links to see analytics data appear here.</p>
          </div>
        ) : (
          <>
            <div className="stats-grid">
              <div className="stat-card">
                <h3>Total Clicks</h3>
                <div className="value">{totalClicks}</div>
              </div>
              <div className="stat-card">
                <h3>Total Links</h3>
                <div className="value">{totalLinks}</div>
              </div>
              <div className="stat-card">
                <h3>Average Clicks</h3>
                <div className="value">{avgClicks}</div>
              </div>
            </div>

            <table className="analytics-table">
              <thead>
                <tr>
                  <th>Link ID</th>
                  <th>Link Title</th>
                  <th>Click Count</th>
                </tr>
              </thead>
              <tbody>
                {entries
                  .sort((a, b) => {
                    const countA = typeof a[1] === 'number' ? a[1] : (a[1]?.count || 0);
                    const countB = typeof b[1] === 'number' ? b[1] : (b[1]?.count || 0);
                    return countB - countA;
                  })
                  .map(([linkId, data]) => {
                    const count = typeof data === 'number' ? data : (data?.count || 0);
                    const title = typeof data === 'object' && data?.title ? data.title : `Link ${linkId}`;
                    return (
                      <tr key={linkId}>
                        <td>
                          <span className="link-id">{linkId}</span>
                        </td>
                        <td>
                          <span className="link-title">{title}</span>
                        </td>
                        <td>
                          <span className="count">{count}</span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}

export default Analytics;
