import { AppRouter } from "./app/AppRouter";
import { AuthProvider } from "./features/auth/AuthProvider";

function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}

export default App;
