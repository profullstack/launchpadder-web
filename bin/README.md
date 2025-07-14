# LaunchPadder Backup and Restore

This directory contains scripts for backing up and restoring your LaunchPadder Docker application.

## Scripts

### `backup-restore.sh`

A comprehensive backup and restore script that handles all application data including:

- **PostgreSQL Databases**: Main application database and Supabase internal database
- **Storage Files**: User uploads and file storage
- **Configuration Files**: Volume configurations and settings
- **Metadata**: Backup information and versioning

## Quick Start

### Create a Backup

```bash
# Create backup with timestamp
./bin/backup-restore.sh backup

# Create backup with custom name
./bin/backup-restore.sh backup my_backup_name
```

### Restore from Backup

```bash
# Restore from a specific backup file
./bin/backup-restore.sh restore backups/backup_20240101_120000.tar.gz
```

### List Available Backups

```bash
./bin/backup-restore.sh list
```

## Detailed Usage

### Backup Command

```bash
./bin/backup-restore.sh backup [backup_name]
```

**What gets backed up:**
- PostgreSQL main database (`POSTGRES_DB`)
- Supabase internal database (`_supabase`)
- PostgreSQL global objects (roles, permissions)
- Storage files from `volumes/storage/`
- Configuration files from `volumes/`
- Backup metadata with timestamp and version info

**Output:**
- Compressed `.tar.gz` file in `backups/` directory
- Includes timestamp and metadata
- Shows backup size and location

### Restore Command

```bash
./bin/backup-restore.sh restore <backup_file.tar.gz>
```

**What gets restored:**
- All database data and structure
- Storage files and uploads
- Configuration files
- Services are automatically restarted

**⚠️ Warning:** Restore will overwrite all existing data. You'll be prompted to confirm.

### List Command

```bash
./bin/backup-restore.sh list
```

Shows all available backups with:
- Backup name
- Creation date
- File size

## Prerequisites

- Docker and Docker Compose installed
- Application services running (database will be started automatically if needed)
- Sufficient disk space for backups
- `jq` command-line JSON processor (for metadata)

## Environment Variables

The script automatically loads environment variables from `.env` file if present. Key variables:

```bash
POSTGRES_DB=postgres          # Main database name
POSTGRES_PASSWORD=postgres    # Database password
POSTGRES_HOST=db             # Database host
POSTGRES_PORT=5432           # Database port
```

## Backup Storage

Backups are stored in the `backups/` directory with the following structure:

```
backups/
├── backup_20240101_120000.tar.gz
├── backup_20240102_080000.tar.gz
└── my_custom_backup.tar.gz
```

Each backup contains:

```
backup_TIMESTAMP/
├── backup_metadata.json     # Backup information
├── database.sql            # Main database dump
├── supabase_internal.sql   # Supabase internal database
├── globals.sql             # PostgreSQL global objects
├── storage/                # Storage files
└── volumes/                # Configuration files
    ├── api/
    ├── db/
    ├── logs/
    ├── pooler/
    └── functions/
```

## Best Practices

### Regular Backups

Set up automated backups using cron:

```bash
# Add to crontab (crontab -e)
# Daily backup at 2 AM
0 2 * * * /path/to/launchpadder-web/bin/backup-restore.sh backup daily_$(date +\%Y\%m\%d)

# Weekly backup on Sundays at 3 AM
0 3 * * 0 /path/to/launchpadder-web/bin/backup-restore.sh backup weekly_$(date +\%Y\%m\%d)
```

### Backup Retention

Clean up old backups to save disk space:

```bash
# Keep only last 7 daily backups
find backups/ -name "daily_*.tar.gz" -mtime +7 -delete

# Keep only last 4 weekly backups
find backups/ -name "weekly_*.tar.gz" -mtime +28 -delete
```

### Testing Restores

Regularly test your backups by restoring to a test environment:

```bash
# Test restore (make sure you're in a test environment!)
./bin/backup-restore.sh restore backups/latest_backup.tar.gz
```

## Troubleshooting

### Common Issues

**Database connection errors:**
```bash
# Check if database service is running
docker compose ps db

# Start database service
docker compose up -d db
```

**Permission errors:**
```bash
# Make sure script is executable
chmod +x bin/backup-restore.sh

# Check Docker permissions
docker compose ps
```

**Disk space issues:**
```bash
# Check available space
df -h

# Clean up old backups
rm backups/old_backup_*.tar.gz
```

### Logs and Debugging

The script provides colored output with different log levels:
- **INFO** (Blue): General information
- **SUCCESS** (Green): Successful operations
- **WARNING** (Yellow): Non-critical issues
- **ERROR** (Red): Critical errors

For debugging, you can run with verbose output:
```bash
bash -x bin/backup-restore.sh backup
```

## Security Considerations

- Backup files contain sensitive data including database passwords
- Store backups in a secure location with appropriate permissions
- Consider encrypting backup files for long-term storage
- Regularly rotate and test backup integrity
- Limit access to backup files and scripts

## Advanced Usage

### Custom Backup Locations

You can modify the `BACKUP_DIR` variable in the script to change the backup location:

```bash
# Edit the script to change backup directory
BACKUP_DIR="/path/to/secure/backup/location"
```

### Selective Restore

The script supports full restore only. For selective restore, you can manually extract and use individual components:

```bash
# Extract backup
tar -xzf backup_20240101_120000.tar.gz

# Restore only database
docker compose exec -T db psql -U postgres < backup_20240101_120000/database.sql

# Restore only storage
cp -r backup_20240101_120000/storage/* volumes/storage/
```

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review Docker Compose logs: `docker compose logs`
3. Verify environment variables and configuration
4. Ensure all prerequisites are installed