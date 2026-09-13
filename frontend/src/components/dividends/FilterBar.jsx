export default function FilterBar({
    search,
    setSearch,
    sectors,
    selectedSector,
    setSelectedSector,
    sortBy,
    setSortBy,
    smartFilter,
    setSmartFilter,
    resultCount,
}) {
    const sortOptions = [
        { value: "score", label: "⭐ Opłacalność" },
        { value: "yield", label: "Stopa dywidendy" },
        { value: "pe", label: "Cena/Zysk (P/E)" },
        { value: "price", label: "Cena" },
        { value: "payout", label: "Wsk. wypłaty" },
    ];

    const smartFilters = [
        { value: "", label: "Wszystkie" },
        { value: "very-safe", label: "🛡️ Stabilna dywidenda" },
        { value: "high-yield-safe", label: "💰 Yield >4% + bezpieczne" },
        { value: "buy-only", label: "✅ Tylko Kupuj" },
        { value: "risky", label: "⚠️ Ryzykowne" },
    ];

    return (
        <div className="div-filter-bar">
            {/* Szukaj */}
            <div className="div-search-box">
                <i className="fa-solid fa-search"></i>
                <input
                    type="text"
                    placeholder="Szukaj ticker lub nazwę..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            {/* Smart filtry */}
            <div className="div-smart-filters">
                <span className="div-sort-label">🎯 Filtr:</span>
                {smartFilters.map((f) => (
                    <button
                        key={f.value}
                        className={`div-smart-btn ${smartFilter === f.value ? "active" : ""}`}
                        onClick={() => setSmartFilter(f.value)}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {/* Sektory */}
            <div className="div-filter-sectors">
                <button
                    className={selectedSector === "Wszystkie" ? "active" : ""}
                    onClick={() => setSelectedSector("Wszystkie")}
                >
                    Wszystkie
                </button>
                {sectors.map((sector) => (
                    <button
                        key={sector}
                        className={selectedSector === sector ? "active" : ""}
                        onClick={() => setSelectedSector(sector)}
                    >
                        {sector}
                    </button>
                ))}
            </div>

            {/* Sortowanie */}
            <div className="div-sort-row">
                <span className="div-sort-label">Sortuj:</span>
                {sortOptions.map((opt) => (
                    <button
                        key={opt.value}
                        className={`div-sort-btn ${sortBy === opt.value ? "active" : ""}`}
                        onClick={() => setSortBy(opt.value)}
                    >
                        {opt.label}
                    </button>
                ))}
                <span className="div-result-count">{resultCount} wyników</span>
            </div>
        </div>
    );
}
