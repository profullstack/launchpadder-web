# .gitignore Configuration Files - Keep vs Exclude

## Updated .gitignore Strategy

You're absolutely right! We need to keep important configuration files in Git while excluding only the data directories. Here's the refined approach:

## ✅ **Configuration Files KEPT in Git**

### 🔧 **Essential Configuration Files**
```
volumes/api/kong.yml          # Kong API Gateway configuration
volumes/logs/vector.yml       # Vector logging configuration
volumes/pooler/pooler.exs     # Supavisor connection pooler config
volumes/db/*.sql              # Database SQL initialization scripts
volumes/functions/           # Edge function templates/configs
```

### 📋 **Why These Should Stay in Git**
- **Kong Configuration**: Defines API routes, CORS, authentication rules
- **Vector Configuration**: Log processing and routing rules
- **Pooler Configuration**: Database connection pooling settings
- **Function Templates**: Edge function boilerplate and configuration

## ❌ **Data Directories EXCLUDED from Git**

### 🗄️ **Database & Runtime Data**
```gitignore
volumes/db/data/             # PostgreSQL database files
volumes/storage/             # User uploads and storage files
volumes/logs/*.log           # Actual log files
volumes/logs/logs/           # Log data directories
```

### 📊 **Why These Should Be Excluded**
- **Database Files**: Contains user data, constantly changing
- **Storage Files**: User uploads, potentially large/sensitive
- **Log Files**: Runtime logs, temporary data

## 🔄 **Updated .gitignore Rules**

```gitignore
# Docker volumes and persistent data (should not be in git)
docker/volumes/

# Supabase Docker volumes - contains database data, logs, storage files
volumes/db/data/
volumes/storage/

# Application uploads and user data
uploads/

# Environment files (security)
.env.production
.env.test
.env.staging

# Keep configuration files but exclude data directories
!volumes/api/
!volumes/logs/
!volumes/pooler/
!volumes/functions/
volumes/logs/*.log
volumes/logs/logs/
```

## 📁 **Directory Structure in Git**

```
volumes/
├── api/
│   └── kong.yml              ✅ KEEP (API configuration)
├── logs/
│   ├── vector.yml            ✅ KEEP (logging configuration)
│   ├── *.log                 ❌ EXCLUDE (actual log files)
│   └── logs/                 ❌ EXCLUDE (log data directory)
├── pooler/
│   └── pooler.exs            ✅ KEEP (pooler configuration)
├── functions/
│   └── main/                 ✅ KEEP (function templates)
├── db/
│   ├── init-db.sql           ✅ KEEP (initialization script)
│   └── data/                 ❌ EXCLUDE (database files)
└── storage/                  ❌ EXCLUDE (user uploads)
```

## 🔍 **Configuration File Contents**

### **Kong Configuration (`volumes/api/kong.yml`)**
- API route definitions
- CORS policies
- Authentication rules
- Service endpoints

### **Vector Configuration (`volumes/logs/vector.yml`)**
- Log processing pipelines
- Output destinations
- Filtering rules

### **Pooler Configuration (`volumes/pooler/pooler.exs`)**
- Connection pool settings
- Database connection parameters
- Performance tuning

## 🚀 **Benefits of This Approach**

### ✅ **Team Collaboration**
- All developers get the same service configurations
- API routes and policies are version controlled
- Configuration changes are tracked and reviewable

### 🔒 **Security**
- Sensitive data (database files, logs) excluded
- Configuration templates without secrets included
- Environment-specific data separated

### 📦 **Deployment**
- Configuration files deployed with code
- Consistent setup across environments
- Infrastructure as code principles

## 🔧 **Docker Compose Integration**

These configuration files are mounted as read-only volumes:

```yaml
volumes:
  - ./volumes/api/kong.yml:/home/kong/temp.yml:ro,z
  - ./volumes/logs/vector.yml:/etc/vector/vector.yml:ro,z
  - ./volumes/pooler/pooler.exs:/etc/pooler/pooler.exs:ro,z
```

The `:ro` flag ensures they're read-only in containers, and the configuration files provide the necessary setup for each service while excluding runtime data.

This approach gives you the best of both worlds: essential configuration in version control, while keeping sensitive and large data files out of Git.