import { useRef } from "react";

export default function Profile({ setHasChanges, username, setUsername, profileImage, setProfileImage, passwordData, setPasswordData, onNavigateHelp }) {
    const fileInputRef = useRef(null);

    const handlePasswordChange = (field, value) => {
        setPasswordData(prev => ({ ...prev, [field]: value }));
        setHasChanges(true);
    };

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            setProfileImage(event.target.result);
            setHasChanges(true);
        };
        reader.readAsDataURL(file);
    };

    return (
        <div className="panel-profile">
            <div className="panel-header">
                <h1>Mój Profil</h1>
                <p>Zarządzaj swoimi danymi osobowymi i ustawieniami bezpieczeństwa.</p>
            </div>

            <div className="profile-content">
                <div className="profile-main-card">
                    <div className="avatar-section">
                        <div className="avatar-wrapper">
                            <img src={profileImage} alt="user" />
                            <div className="avatar-overlay" onClick={() => fileInputRef.current.click()}>
                                <i className="fa-solid fa-camera"></i>
                            </div>
                        </div>
                        <input
                            type="file"
                            accept="image/*"
                            ref={fileInputRef}
                            style={{ display: "none" }}
                            onChange={handleImageUpload}
                        />
                        <div className="avatar-info">
                            <h3>Twoje zdjęcie</h3>
                            <p>PNG, JPG do 5MB</p>
                            <button className="upload-btn" onClick={() => fileInputRef.current.click()}>Zmień zdjęcie</button>
                        </div>
                    </div>

                    <div className="profile-form-grid">
                        <div className="form-group">
                            <label>Nazwa użytkownika</label>
                            <div className="input-with-icon">
                                <i className="fa-solid fa-user"></i>
                                <input
                                    type="text"
                                    placeholder="Nazwa użytkownika"
                                    value={username}
                                    onChange={(e) => {
                                        setUsername(e.target.value);
                                        setHasChanges(true);
                                    }}
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Adres E-mail</label>
                            <div className="input-with-icon">
                                <i className="fa-solid fa-envelope"></i>
                                <input 
                                    type="email" 
                                    placeholder="twoj@email.com" 
                                    onChange={() => setHasChanges(true)} 
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="profile-secondary-section">
                    <div className="section-title">
                        <i className="fa-solid fa-shield-halved"></i>
                        <h2>Bezpieczeństwo</h2>
                    </div>

                    <div className="security-card">
                        <div className="profile-form-grid">
                            <div className="form-group">
                                <label>Obecne hasło</label>
                                <input 
                                    type="password" 
                                    placeholder="••••••••" 
                                    value={passwordData.current}
                                    onChange={(e) => handlePasswordChange("current", e.target.value)} 
                                />
                            </div>
                            <div className="form-group">
                                <label>Nowe hasło</label>
                                <input 
                                    type="password" 
                                    placeholder="Min. 9 znaków, 1W, 1m, 1C, 2S" 
                                    value={passwordData.new}
                                    onChange={(e) => handlePasswordChange("new", e.target.value)}
                                />
                            </div>
                            <div className="form-group">
                                <label>Powtórz nowe hasło</label>
                                <input 
                                    type="password" 
                                    placeholder="Powtórz hasło" 
                                    value={passwordData.confirm}
                                    onChange={(e) => handlePasswordChange("confirm", e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="security-footer">
                            <p>Ostatnia zmiana hasła: dzisiaj</p>
                            <a href="#" onClick={(e) => {
                                e.preventDefault();
                                onNavigateHelp();
                            }}>Nie pamiętasz hasła?</a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
