import { useAuth, useClerk, SignInButton, SignUpButton, UserButton } from "@clerk/clerk-react";
import "./Nav.css";

function Nav() {
  const { isSignedIn, isLoaded, user } = useAuth();
  const { signOut } = useClerk();

  if (!isLoaded) {
    return null;
  }

  return (
    <nav className="nav-container">
      <div className="nav-content">
        <div className="nav-brand">
          <h2>📊 Analytics Dashboard</h2>
        </div>
        
        <div className="nav-auth">
          {isSignedIn ? (
            <>
              <span className="nav-user-email">
                {user?.emailAddresses[0]?.emailAddress}
              </span>
              <UserButton />
              <button onClick={() => signOut()} className="nav-sign-out">
                Sign Out
              </button>
            </>
          ) : (
            <>
              <SignInButton mode="modal">
                <button className="nav-button nav-sign-in">Sign In</button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="nav-button nav-sign-up">Sign Up</button>
              </SignUpButton>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

export default Nav;

