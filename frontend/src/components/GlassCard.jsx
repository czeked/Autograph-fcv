import React from 'react';

const GlassCard = ({ children, className = "", style = {} }) => (
  <div className={`glass-card ${className}`} style={style}>{children}</div>
);

export default GlassCard;
