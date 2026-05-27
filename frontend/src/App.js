import { BrowserRouter, Routes, Route } from "react-router-dom"
import Login from "./pages/Login"
import AdminDashboard from "./pages/AdminDashboard"
import EmployeeDashboard from "./pages/EmployeeDashboard"
import CreateEmployee from "./pages/CreateEmployee"
import RecruiterDashboard from "./pages/RecruiterDashboard"
import HRDashboard from "./pages/HRDashboard"
import JuniorHRDashboard from "./pages/JuniorHRDashboard"
import RequestDetail from "./pages/RequestDetail"
import ProtectedRoute from "./components/ProtectedRoute"
import Toast from "./components/Toast" // ✅ Our custom toast

function App() {
  return (
    <BrowserRouter>
      <Toast /> {/* ✅ Custom toast component */}
      <Routes>
        <Route path="/" element={<Login />} />

        {/* Admin */}
        <Route path="/admin" element={
          <ProtectedRoute role="ADMIN"><AdminDashboard /></ProtectedRoute>
        }/>
        <Route path="/admin/create-employee" element={
          <ProtectedRoute role="ADMIN"><CreateEmployee /></ProtectedRoute>
        }/>

        {/* Shared */}
        <Route path="/request/:id" element={
          <ProtectedRoute roles={["ADMIN", "EMPLOYEE"]}><RequestDetail /></ProtectedRoute>
        }/>

        {/* Employee */}
        <Route path="/employee" element={
          <ProtectedRoute role="EMPLOYEE"><EmployeeDashboard /></ProtectedRoute>
        }/>
        <Route path="/my-request/:id" element={
          <ProtectedRoute role="EMPLOYEE"><RequestDetail /></ProtectedRoute>
        }/>

        {/* Recruiter */}
        <Route path="/recruiter" element={
          <ProtectedRoute role="RECRUITER"><RecruiterDashboard /></ProtectedRoute>
        }/>

        {/* HR */}
        <Route path="/hr" element={
          <ProtectedRoute role="HR"><HRDashboard /></ProtectedRoute>
        }/>

        {/* Junior HR */}
        <Route path="/junior-hr" element={
          <ProtectedRoute role="JUNIOR_HR"><JuniorHRDashboard /></ProtectedRoute>
        }/>
      </Routes>
    </BrowserRouter>
  )
}

export default App