import { useAuth } from "@clerk/clerk-react";
import Nav from "./Nav";
import Analytics from "./Analytics";
import "./App.css";

function App() {
  const { isSignedIn, isLoaded, user } = useAuth();

  // Log user object for debugging
  if (user) {
    console.log("User object:", user);
  }

  if (!isLoaded) {
    return (
      <>
        <Nav />
        <div className="loading-container">
          <div className="loading">Loading...</div>
        </div>
      </>
    );
  }

  return (
    <>
      <Nav />
      {!isSignedIn ? (
        <div className="auth-container">
          <div className="auth-card">
            <h1>📊 Analytics Dashboard</h1>
            <p>Please sign in to view analytics</p>
            <p style={{ fontSize: "14px", color: "#666", marginTop: "20px" }}>
              Use the Sign In button in the navigation bar above
            </p>
          </div>
        </div>
      ) : (
        <Analytics />
      )}
    </>
  );
}

export default App;
