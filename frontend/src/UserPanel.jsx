import { useState } from "react";
import UserPage from "./UserPage";

function UserPanel() {
    const [activeSection, setActiveSection] = useState("dashboard");
    const [hasChanges, setHasChanges] = useState(false);

    return (
        <div className="layout">

            <UserPage
                setActiveSection={setActiveSection}
                hasChanges={hasChanges}
                setHasChanges={setHasChanges}
            />

            <div className="content">
                {activeSection === "dashboard" && <Dashboard/>}

                {activeSection === "notifications" && <Notifications/>}

                {activeSection === "profile" && <Profile/>}

                {activeSection === "plans" && <Plans/>}

                {activeSection === "settings" && <Settings/>}

                {activeSection === "help" && <h1>Pomoc</h1>}

            </div>

        </div>
    );
}

export default UserPanel;