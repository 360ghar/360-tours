# Database Schema

## Executive Summary

This document provides a comprehensive database schema design for the 360 Tours Platform. The schema is designed using PostgreSQL as the primary database, optimized for performance, scalability, and data integrity. The design follows best practices for relational database design while accommodating the unique requirements of a virtual tour platform.

## Database Overview

### Database Technology Stack

- **Primary Database**: PostgreSQL 15+
- **Geospatial Support**: PostGIS for location-based features
- **Cache Layer**: Redis 7+ for session management and caching
- **Object Storage**: S3-compatible object storage (or equivalent)
- **Time Series**: TimescaleDB for analytics data (optional)

### Database Naming Conventions

- **Table Names**: snake_case, plural form
- **Column Names**: snake_case
- **Primary Keys**: id (UUID)
- **Foreign Keys**: {table}_id
- **Indexes**: idx_{table}_{column}
- **Unique Constraints**: uq_{table}_{column}

### Database Environment Setup

The 360 Viewer database extends the 360 Ghar backend database infrastructure. The database is named "360_viewer" and requires the following PostgreSQL extensions to be enabled:

- **uuid-ossp**: Provides functions for generating universally unique identifiers (UUIDs), which are used as primary keys throughout the schema
- **btree_gist**: Enables GiST index operator classes for common data types, improving query performance for range and exclusion constraints
- **postgis**: Adds support for geographic objects, enabling location-based queries and spatial indexing for tour locations

## Core Tables

### 1. Users Table

**Purpose**: Stores user account information. This table serves as the central identity store for all platform users and tracks their storage usage.

**Columns**:

| Column | Data Type | Constraints | Description |
|--------|-----------|-------------|-------------|
| id | UUID | Primary Key, Auto-generated | Unique identifier for the user |
| supabase_user_id | UUID | Unique, Not Null | Supabase Auth user ID (links to auth.users) |
| phone | VARCHAR(20) | Unique, Not Null | User's phone number (primary auth identifier, e.g., +91XXXXXXXXXX) |
| phone_verified | BOOLEAN | Default: false | Indicates whether the phone has been verified via OTP |
| email | VARCHAR(255) | Unique, Nullable | User's email address (optional profile field, not used for auth) |
| email_verified | BOOLEAN | Default: false | Indicates whether the email has been verified |
| full_name | VARCHAR(200) | Nullable | User's full name |
| date_of_birth | DATE | Nullable | User's date of birth |
| profile_image_url | VARCHAR(512) | Nullable | URL to the user's profile image |
| storage_usage | BIGINT | Default: 0 | Current storage used in bytes |
| created_at | TIMESTAMP WITH TIME ZONE | Default: NOW() | Account creation timestamp |
| updated_at | TIMESTAMP WITH TIME ZONE | Default: NOW() | Last modification timestamp |
| last_login_at | TIMESTAMP WITH TIME ZONE | Nullable | Most recent login timestamp |
| deleted_at | TIMESTAMP WITH TIME ZONE | Nullable | Soft delete timestamp (null if active) |

**Indexes**:
- **idx_users_phone**: B-tree index on phone for fast login lookups
- **idx_users_supabase_id**: B-tree index on supabase_user_id for Supabase Auth lookups
- **idx_users_email**: B-tree index on email for email-based queries
- **idx_users_created_at**: B-tree index on created_at for chronological queries
- **idx_users_deleted_at**: Partial B-tree index on deleted_at where deleted_at IS NOT NULL for efficient soft-delete queries

**Triggers**:
- **update_users_updated_at**: Before update trigger that automatically sets the updated_at column to the current timestamp whenever a row is modified

### 2. Tours Table

**Purpose**: Stores virtual tour metadata and configuration. This is a central entity that contains all information about a tour including its visibility settings, engagement metrics, and custom configuration options.

**Columns**:

| Column | Data Type | Constraints | Description |
|--------|-----------|-------------|-------------|
| id | UUID | Primary Key, Auto-generated | Unique identifier for the tour |
| user_id | UUID | Foreign Key → users(id), Not Null, ON DELETE CASCADE | Owner of the tour |
| title | VARCHAR(255) | Not Null | Tour title displayed to viewers |
| description | TEXT | Nullable | Detailed description of the tour |
| status | VARCHAR(20) | Default: 'draft', Check constraint: must be 'draft', 'published', or 'archived' | Current publication status |
| visibility | VARCHAR(20) | Default: 'private', Check constraint: must be 'private', 'unlisted', or 'public' | Tour visibility and access control |
| is_featured | BOOLEAN | Default: false | Whether the tour is featured on the platform |
| view_count | BIGINT | Default: 0 | Total number of views |
| like_count | BIGINT | Default: 0 | Total number of likes |
| share_count | BIGINT | Default: 0 | Total number of shares |
| settings | JSONB | Default: '{}' | Custom tour configuration (autoplay, rotation speed, etc.) |
| published_at | TIMESTAMP WITH TIME ZONE | Nullable | When the tour was first published |
| archived_at | TIMESTAMP WITH TIME ZONE | Nullable | When the tour was archived |
| created_at | TIMESTAMP WITH TIME ZONE | Default: NOW() | Tour creation timestamp |
| updated_at | TIMESTAMP WITH TIME ZONE | Default: NOW() | Last modification timestamp |
| deleted_at | TIMESTAMP WITH TIME ZONE | Nullable | Soft delete timestamp |

**Indexes**:
- **idx_tours_user_id**: B-tree index on user_id for fetching user's tours
- **idx_tours_status**: B-tree index on status for filtering by publication status
- **idx_tours_visibility_public**: Partial B-tree index on visibility where visibility = 'public' for public tour discovery
- **idx_tours_featured**: Partial B-tree index on is_featured where is_featured = true for featured tour queries
- **idx_tours_created_at**: B-tree index on created_at for chronological ordering
- **idx_tours_deleted_at**: Partial B-tree index on deleted_at where deleted_at IS NOT NULL
- **idx_tours_user_status**: Composite B-tree index on (user_id, status) for efficient filtered queries

### 3. Scenes Table

**Purpose**: Stores individual 360-degree scenes within tours. Each scene represents a single panoramic image or video that users can navigate through within a tour.

**Columns**:

| Column | Data Type | Constraints | Description |
|--------|-----------|-------------|-------------|
| id | UUID | Primary Key, Auto-generated | Unique identifier for the scene |
| tour_id | UUID | Foreign Key → tours(id), Not Null, ON DELETE CASCADE | Parent tour |
| title | VARCHAR(255) | Nullable | Scene title (e.g., "Living Room", "Kitchen") |
| description | TEXT | Nullable | Detailed scene description |
| image_url | VARCHAR(512) | Not Null | URL to the 360-degree panoramic image |
| thumbnail_url | VARCHAR(512) | Nullable | URL to the scene thumbnail |
| vr_url | VARCHAR(512) | Nullable | URL to VR-optimized version |
| order_index | INTEGER | Not Null, Default: 0, Check constraint: >= 0 | Position in the tour sequence |
| metadata | JSONB | Default: '{}' | Additional scene metadata (camera settings, initial view angle, etc.) |
| is_processed | BOOLEAN | Default: false | Whether the scene has been processed for optimization |
| processing_error | TEXT | Nullable | Error message if processing failed |
| created_at | TIMESTAMP WITH TIME ZONE | Default: NOW() | Scene creation timestamp |
| updated_at | TIMESTAMP WITH TIME ZONE | Default: NOW() | Last modification timestamp |

**Constraints**:
- **scenes_order_index_positive**: Check constraint ensuring order_index is greater than or equal to 0

**Indexes**:
- **idx_scenes_tour_id**: B-tree index on tour_id for fetching all scenes in a tour
- **idx_scenes_order_index**: Composite B-tree index on (tour_id, order_index) for ordered scene retrieval
- **idx_scenes_processed**: B-tree index on is_processed for finding unprocessed scenes
- **idx_scenes_created_at**: B-tree index on created_at for chronological queries

### 4. Hotspots Table

**Purpose**: Stores interactive hotspots within scenes. Hotspots are clickable elements that allow navigation between scenes, display information, or trigger media playback.

**Columns**:

| Column | Data Type | Constraints | Description |
|--------|-----------|-------------|-------------|
| id | UUID | Primary Key, Auto-generated | Unique identifier for the hotspot |
| scene_id | UUID | Foreign Key → scenes(id), Not Null, ON DELETE CASCADE | Parent scene |
| type | VARCHAR(50) | Not Null, Check constraint: must be 'navigation', 'info', 'audio', 'video', 'link', or 'custom' | Hotspot type determining behavior |
| position | JSONB | Not Null, Must contain 'yaw' and 'pitch' keys (radius optional) | 3D position in spherical coordinates |
| target_scene_id | UUID | Foreign Key → scenes(id), Nullable | Destination scene for navigation hotspots |
| title | VARCHAR(255) | Nullable | Hotspot label |
| description | TEXT | Nullable | Detailed information for info hotspots |
| icon_name | VARCHAR(50) | Nullable | Icon identifier |
| icon_color | VARCHAR(7) | Nullable | HEX color code for the icon |
| icon_size | INTEGER | Default: 32, Check constraint: > 0 AND <= 100 | Icon size in pixels |
| content | JSONB | Default: '{}' | Typed content payload (see ../00-conventions.md) |
| order_index | INTEGER | Default: 0 | Display order for hotspot lists |
| is_active | BOOLEAN | Default: true | Whether the hotspot is currently active |
| created_at | TIMESTAMP WITH TIME ZONE | Default: NOW() | Hotspot creation timestamp |
| updated_at | TIMESTAMP WITH TIME ZONE | Default: NOW() | Last modification timestamp |

**Constraints**:
- **hotspot_position_valid**: Check constraint ensuring the position JSONB object contains 'yaw' and 'pitch' keys
- **hotspot_icon_size_valid**: Check constraint ensuring icon_size is between 1 and 100

**Indexes**:
- **idx_hotspots_scene_id**: B-tree index on scene_id for fetching scene hotspots
- **idx_hotspots_type**: B-tree index on type for filtering by hotspot type
- **idx_hotspots_target_scene_id**: B-tree index on target_scene_id for navigation graph queries
- **idx_hotspots_order_index**: Composite B-tree index on (scene_id, order_index) for ordered retrieval
- **idx_hotspots_active**: Partial B-tree index on is_active where is_active = true

### 5. Media Files Table

**Purpose**: Stores information about uploaded media files including images, audio, and video. This table tracks file metadata, processing status, and storage locations.

**Columns**:

| Column | Data Type | Constraints | Description |
|--------|-----------|-------------|-------------|
| id | UUID | Primary Key, Auto-generated | Unique identifier for the media file |
| user_id | UUID | Foreign Key → users(id), Not Null, ON DELETE CASCADE | File owner |
| filename | VARCHAR(255) | Not Null | System-generated unique filename |
| original_filename | VARCHAR(255) | Nullable | Original filename as uploaded |
| file_url | VARCHAR(512) | Not Null | Primary storage URL |
| thumbnail_url | VARCHAR(512) | Nullable | Thumbnail image URL |
| cdn_url | VARCHAR(512) | Nullable | CDN-optimized URL for fast delivery |
| file_size | BIGINT | Not Null | File size in bytes |
| mime_type | VARCHAR(100) | Not Null | MIME type (e.g., 'image/jpeg', 'video/mp4') |
| width | INTEGER | Nullable | Image/video width in pixels |
| height | INTEGER | Nullable | Image/video height in pixels |
| duration | INTEGER | Nullable | Duration in seconds for audio/video files |
| folder | VARCHAR(255) | Nullable | Virtual folder for organization |
| visibility | VARCHAR(20) | Default: 'private', Check constraint: must be 'public', 'private', or 'unlisted' | Access control setting |
| is_processed | BOOLEAN | Default: false | Whether the file has been processed |
| processing_metadata | JSONB | Default: '{}' | Processing results and optimization data |
| created_at | TIMESTAMP WITH TIME ZONE | Default: NOW() | Upload timestamp |
| expires_at | TIMESTAMP WITH TIME ZONE | Nullable | Expiration timestamp for temporary files |

**Indexes**:
- **idx_media_files_user_id**: B-tree index on user_id for fetching user's files
- **idx_media_files_mime_type**: B-tree index on mime_type for filtering by file type
- **idx_media_files_folder**: B-tree index on folder for folder-based organization
- **idx_media_files_visibility**: B-tree index on visibility for access control queries
- **idx_media_files_processed**: B-tree index on is_processed for finding unprocessed files
- **idx_media_files_created_at**: B-tree index on created_at for chronological ordering
- **idx_media_files_expires_at**: Partial B-tree index on expires_at where expires_at IS NOT NULL for cleanup queries

### 6. AI Processing Jobs Table

**Purpose**: Tracks AI processing jobs for automatic tour generation. This table manages the lifecycle of AI-powered features including scene detection, hotspot placement, and tour optimization.

**Columns**:

| Column | Data Type | Constraints | Description |
|--------|-----------|-------------|-------------|
| id | UUID | Primary Key, Auto-generated | Unique identifier for the job |
| tour_id | UUID | Foreign Key → tours(id), Not Null, ON DELETE CASCADE | Associated tour |
| user_id | UUID | Foreign Key → users(id), Not Null, ON DELETE CASCADE | Job requester |
| job_type | VARCHAR(50) | Not Null, Check constraint: must be 'tour_generation', 'scene_detection', 'hotspot_suggestions', 'description_generation', or 'quality_checks' | Type of AI processing |
| status | VARCHAR(20) | Default: 'queued', Check constraint: must be 'queued', 'processing', 'completed', 'failed', or 'canceled' | Current job status |
| progress | INTEGER | Default: 0, Check constraint: >= 0 AND <= 100 | Completion percentage |
| input | JSONB | Not Null | Input parameters for the AI job |
| output | JSONB | Default: '{}' | Results from the AI processing |
| error_message | TEXT | Nullable | Error details if the job failed |
| estimated_duration | INTEGER | Nullable | Estimated processing time in seconds |
| actual_duration | INTEGER | Nullable | Actual processing time in seconds |
| processing_started_at | TIMESTAMP WITH TIME ZONE | Nullable | When processing began |
| processing_completed_at | TIMESTAMP WITH TIME ZONE | Nullable | When processing finished |
| created_at | TIMESTAMP WITH TIME ZONE | Default: NOW() | Job creation timestamp |
| updated_at | TIMESTAMP WITH TIME ZONE | Default: NOW() | Last status update timestamp |

**Indexes**:
- **idx_ai_jobs_tour_id**: B-tree index on tour_id for fetching tour's processing jobs
- **idx_ai_jobs_user_id**: B-tree index on user_id for user job history
- **idx_ai_jobs_status**: B-tree index on status for queue management
- **idx_ai_jobs_type**: B-tree index on job_type for filtering by job type
- **idx_ai_jobs_created_at**: B-tree index on created_at for chronological ordering
- **idx_ai_jobs_processing_started**: Partial B-tree index on processing_started_at where processing_started_at IS NOT NULL for active job monitoring

### 7. Analytics Events Table

**Purpose**: Tracks user interactions and tour analytics. This table stores detailed event data for understanding user behavior, measuring engagement, and generating performance reports.

**Columns**:

| Column | Data Type | Constraints | Description |
|--------|-----------|-------------|-------------|
| id | UUID | Primary Key, Auto-generated | Unique identifier for the event |
| tour_id | UUID | Foreign Key → tours(id), Not Null, ON DELETE CASCADE | Associated tour |
| user_id | UUID | Foreign Key → users(id), Nullable | Logged-in user (null for anonymous) |
| session_id | VARCHAR(255) | Not Null | Unique session identifier |
| event_type | VARCHAR(50) | Not Null | Type of event (e.g., 'tour_view', 'scene_view', 'hotspot_click', 'tour_share', 'tour_like') |
| event_data | JSONB | Default: '{}' | Additional event-specific data |
| user_agent | VARCHAR(1000) | Nullable | Browser/client user agent string |
| ip_address | INET | Nullable | Client IP address |
| country_code | VARCHAR(2) | Nullable | Two-letter country code |
| city | VARCHAR(100) | Nullable | City name from geolocation |
| device_type | VARCHAR(50) | Nullable | Device category (desktop, mobile, tablet) |
| browser | VARCHAR(50) | Nullable | Browser name |
| os | VARCHAR(50) | Nullable | Operating system |
| screen_resolution | VARCHAR(20) | Nullable | Screen resolution (e.g., '1920x1080') |
| created_at | TIMESTAMP WITH TIME ZONE | Default: NOW() | Event timestamp |

**Indexes**:
- **idx_analytics_tour_id**: B-tree index on tour_id for tour-specific analytics
- **idx_analytics_user_id**: B-tree index on user_id for user behavior analysis
- **idx_analytics_event_type**: B-tree index on event_type for filtering by event type
- **idx_analytics_session_id**: B-tree index on session_id for session-based queries
- **idx_analytics_created_at**: B-tree index on created_at for time-range queries
- **idx_analytics_tour_event_date**: Composite B-tree index on (tour_id, event_type, created_at) for efficient aggregation queries

### 9. User Sessions Table

**Purpose**: Manages user sessions and refresh tokens. This table stores authentication session data for secure token management and session invalidation.

**Columns**:

| Column | Data Type | Constraints | Description |
|--------|-----------|-------------|-------------|
| id | UUID | Primary Key, Auto-generated | Unique identifier for the session |
| user_id | UUID | Foreign Key → users(id), Not Null, ON DELETE CASCADE | Session owner |
| refresh_token_hash | VARCHAR(255) | Not Null | Hashed refresh token for secure storage |
| access_token_hash | VARCHAR(255) | Nullable | Hashed access token for validation |
| user_agent | VARCHAR(1000) | Nullable | Client user agent string |
| ip_address | INET | Nullable | Client IP address |
| expires_at | TIMESTAMP WITH TIME ZONE | Not Null | Session expiration timestamp |
| is_revoked | BOOLEAN | Default: false | Whether the session has been revoked |
| created_at | TIMESTAMP WITH TIME ZONE | Default: NOW() | Session creation timestamp |
| last_accessed_at | TIMESTAMP WITH TIME ZONE | Default: NOW() | Most recent session activity |

**Indexes**:
- **idx_sessions_user_id**: B-tree index on user_id for fetching user's sessions
- **idx_sessions_refresh_token**: B-tree index on refresh_token_hash for token lookup
- **idx_sessions_access_token**: B-tree index on access_token_hash for token validation
- **idx_sessions_expires_at**: B-tree index on expires_at for cleanup queries
- **idx_sessions_revoked**: Partial B-tree index on is_revoked where is_revoked = false for active session queries

### 8. Floor Plans Table

**Purpose**: Stores floor plan images and scene markers for tours. Each floor plan represents one floor/level with interactive markers that link to scenes.

**Columns**:

| Column | Data Type | Constraints | Description |
|--------|-----------|-------------|-------------|
| id | UUID | Primary Key, Auto-generated | Unique identifier for the floor plan |
| tour_id | UUID | Foreign Key → tours(id), Not Null, ON DELETE CASCADE | Parent tour |
| name | VARCHAR(255) | Not Null | Floor plan name (e.g., "Ground Floor") |
| image_url | VARCHAR(512) | Not Null | URL to the floor plan image |
| floor_number | INTEGER | Default: 0 | Floor/level number for ordering |
| markers | JSONB | Default: '[]' | Array of scene markers with x/y coordinates (percentage 0-100) |
| created_at | TIMESTAMP WITH TIME ZONE | Default: NOW() | Creation timestamp |
| updated_at | TIMESTAMP WITH TIME ZONE | Default: NOW() | Last modification timestamp |

**Indexes**:
- **idx_floor_plans_tour_id**: B-tree index on tour_id for fetching tour's floor plans
- **idx_floor_plans_floor_number**: Composite B-tree index on (tour_id, floor_number) for ordered retrieval

**Notes**: Public tour payloads "hydrate" `settings.floor_plans` from this table for viewer consumption.

## Geospatial Tables

### 10. Locations Table

**Purpose**: Stores location information for tours with geographic features. This table enables location-based tour discovery and mapping functionality using PostGIS spatial data types.

**Columns**:

| Column | Data Type | Constraints | Description |
|--------|-----------|-------------|-------------|
| id | UUID | Primary Key, Auto-generated | Unique identifier for the location |
| tour_id | UUID | Foreign Key → tours(id), Not Null, ON DELETE CASCADE | Associated tour |
| name | VARCHAR(255) | Nullable | Location name (e.g., "Taj Mahal") |
| address | TEXT | Nullable | Full street address |
| city | VARCHAR(100) | Nullable | City name |
| state | VARCHAR(100) | Nullable | State or province |
| country | VARCHAR(100) | Nullable | Country name |
| postal_code | VARCHAR(20) | Nullable | Postal/ZIP code |
| coordinates | GEOGRAPHY(POINT, 4326) | Nullable | Geographic coordinates (PostGIS point using WGS84) |
| timezone | VARCHAR(50) | Nullable | IANA timezone identifier |
| elevation | DECIMAL(10, 2) | Nullable | Elevation in meters above sea level |
| created_at | TIMESTAMP WITH TIME ZONE | Default: NOW() | Record creation timestamp |
| updated_at | TIMESTAMP WITH TIME ZONE | Default: NOW() | Last modification timestamp |

**Indexes**:
- **idx_locations_tour_id**: B-tree index on tour_id for fetching tour location
- **idx_locations_coordinates**: GiST spatial index on coordinates for geographic proximity queries
- **idx_locations_country_city**: Composite B-tree index on (country, city) for location-based filtering

## Performance Optimization Tables

### 11. Search Index Table

**Purpose**: Full-text search for tours and scenes. This table maintains pre-computed text search vectors for fast full-text search across tour and scene content.

**Columns**:

| Column | Data Type | Constraints | Description |
|--------|-----------|-------------|-------------|
| id | UUID | Primary Key, Auto-generated | Unique identifier for the search index entry |
| tour_id | UUID | Foreign Key → tours(id), Not Null, ON DELETE CASCADE | Indexed tour |
| scene_id | UUID | Foreign Key → scenes(id), Nullable, ON DELETE CASCADE | Indexed scene (null for tour-level entries) |
| search_vector | TSVECTOR | Nullable | Pre-computed text search vector |
| weight_tsrank | FLOAT | Nullable | Search result ranking weight |
| created_at | TIMESTAMP WITH TIME ZONE | Default: NOW() | Index creation timestamp |
| updated_at | TIMESTAMP WITH TIME ZONE | Default: NOW() | Last re-index timestamp |

**Indexes**:
- **idx_search_vector**: GIN index on search_vector for fast full-text search
- **idx_search_tour_id**: B-tree index on tour_id for tour-specific search
- **idx_search_scene_id**: B-tree index on scene_id for scene-specific search

**Triggers**:
- **trigger_update_tour_search_vector**: After insert or update trigger on tours table that automatically updates the search_vector by combining the tour title and description into a single searchable text vector using English language stemming
- **trigger_update_scene_search_vector**: After insert or update trigger on scenes table that automatically updates the search_vector by combining the scene title and description into a searchable text vector

### 12. Cache Table

**Purpose**: Database-level caching for frequently accessed data. This table provides a key-value cache with automatic expiration for reducing database load on frequently accessed data.

**Columns**:

| Column | Data Type | Constraints | Description |
|--------|-----------|-------------|-------------|
| key | VARCHAR(255) | Primary Key | Unique cache key |
| value | JSONB | Not Null | Cached data |
| expires_at | TIMESTAMP WITH TIME ZONE | Not Null | Cache expiration timestamp |
| created_at | TIMESTAMP WITH TIME ZONE | Default: NOW() | Cache entry creation timestamp |

**Indexes**:
- **idx_cache_expires_at**: B-tree index on expires_at for cleanup operations
- **idx_cache_created_at**: B-tree index on created_at for cache statistics

**Triggers**:
- **trigger_expire_cache**: Before insert or update trigger that automatically deletes expired cache entries (where expires_at is in the past), providing self-cleaning cache behavior

## Database Views

### 1. User Activity View

**Purpose**: Aggregated user activity statistics. This view provides a denormalized view of user activity metrics for dashboards and reporting.

**Computed Columns**:
- **id**: User's unique identifier
- **first_name**: User's first name
- **last_name**: User's last name
- **total_tours**: Count of all non-deleted tours owned by the user
- **published_tours**: Count of tours with 'published' status
- **total_views**: Sum of view counts across all user's tours
- **total_sessions**: Count of unique sessions from analytics events in the last 30 days
- **last_activity_at**: Most recent tour update timestamp

**Data Sources**: Joins users, tours, and analytics_events tables with filters for non-deleted records and 30-day analytics window.

### 2. Tour Performance View

**Purpose**: Tour performance metrics for analytics. This view aggregates engagement and interaction metrics for each tour.

**Computed Columns**:
- **id**: Tour's unique identifier
- **title**: Tour title
- **user_id**: Tour owner's ID
- **status**: Publication status
- **view_count**: Total views
- **like_count**: Total likes
- **share_count**: Total shares
- **scene_count**: Number of scenes in the tour
- **hotspot_count**: Total hotspots across all scenes
- **unique_viewers**: Count of unique sessions with 'tour_view' events
- **unique_likers**: Count of unique sessions with 'tour_like' events
- **unique_sharers**: Count of unique sessions with 'tour_share' events
- **avg_scene_time**: Average time spent per scene (from event_data)
- **created_at**: Tour creation timestamp

**Data Sources**: Joins tours, scenes, hotspots, and analytics_events tables with filters for non-deleted tours.

## Database Functions

### 1. Update Updated At Column

**Purpose**: Automatically updates the updated_at timestamp column whenever a row is modified. This trigger function is attached to tables that require modification tracking.

**Behavior**: Sets the updated_at column to the current timestamp (NOW()) before any UPDATE operation completes on the row.

### 2. Calculate Storage Usage

**Purpose**: Calculates the total storage usage for a specific user by summing the file sizes of all their active media files.

**Input**: user_id (UUID) - The user whose storage to calculate

**Returns**: BIGINT - Total storage used in bytes

**Behavior**: Sums the file_size column from media_files where the user_id matches and the file is not expired (expires_at is null or in the future).

### 3. Update User Storage Usage

**Purpose**: Updates a user's storage_usage column with their current calculated storage consumption.

**Input**: user_id (UUID) - The user to update

**Behavior**: Calls calculate_storage_usage to get the current usage, then updates the users table with the result.

### 4. Update Tour Statistics

**Purpose**: Recalculates and updates engagement statistics for a specific tour based on analytics events.

**Input**: tour_id (UUID) - The tour to update

**Behavior**:
- Counts unique sessions with 'tour_view' events from the last 30 days
- Counts unique sessions with 'tour_like' events from the last 30 days
- Counts unique sessions with 'tour_share' events from the last 30 days
- Updates the tour's view_count, like_count, share_count, and updated_at columns

### 5. Update Search Vector

**Purpose**: Maintains the full-text search index by updating search vectors when tours or scenes are modified.

**Behavior**:
- When triggered by tours table changes: Creates or updates a search_index entry combining the tour's title and description into a TSVECTOR using English language configuration
- When triggered by scenes table changes: Creates or updates a search_index entry combining the scene's title and description into a TSVECTOR

### 6. Expire Cache

**Purpose**: Automatically cleans up expired cache entries to prevent unbounded table growth.

**Behavior**: Deletes all rows from the cache table where expires_at is earlier than the current timestamp. Executed before each INSERT or UPDATE on the cache table.

### 7. Soft Delete

**Purpose**: Provides a generic soft delete mechanism that sets the deleted_at timestamp instead of permanently removing records.

**Input**:
- table_name (TEXT) - Name of the table containing the record
- record_id (UUID) - ID of the record to soft delete

**Behavior**: Executes a dynamic UPDATE statement on the specified table, setting deleted_at to NOW() for the specified record.

## Database Migrations

### Migration Structure

Database migrations are organized as sequential SQL files with numerical prefixes (e.g., 001_initial_schema.sql, 002_add_ai_tables.sql). Each migration file contains the schema changes wrapped in a transaction block to ensure atomicity. If any statement fails, the entire migration is rolled back to maintain database consistency.

### Migration Management

The platform uses Alembic for migration management, which provides version control for the database schema. Alembic tracks applied migrations in a dedicated table and supports both automatic schema diff detection and manual migration authoring.

**Key Migration Operations**:
- **Creating Migrations**: Alembic can auto-generate migrations by comparing the current database state against SQLAlchemy model definitions, or developers can write custom migration scripts for complex changes
- **Upgrading**: Migrations are applied sequentially from the current version to the target version (typically 'head' for latest)
- **Downgrading**: Migrations can be reversed to undo schema changes, useful for rollbacks during deployment failures

## Database Security

### Row Level Security (RLS)

Row Level Security is enabled on sensitive tables to ensure users can only access data they own or have been granted access to. RLS policies are enforced at the database level, providing defense-in-depth beyond application-level access controls.

**Protected Tables**:
- **tours**: Users can only access tours they own (where user_id matches the authenticated user)
- **scenes**: Users can only access scenes belonging to their tours
- **analytics_events**: Users can only view analytics for their own tours

**Policy Design**:
- Policies use the authenticated role to identify the current user via the auth.uid() function
- All CRUD operations (SELECT, INSERT, UPDATE, DELETE) are restricted by these policies

### Data Encryption

Sensitive data is protected using the pgcrypto extension for column-level encryption. The following approach is used:

**Encrypted Columns**:
- email_encrypted: User email addresses stored with AES encryption
- password_hash_encrypted: Password hashes with additional encryption layer

**Encryption Approach**: Data is encrypted using AES symmetric encryption with a server-managed encryption key. The key is stored securely outside the database and provided to the encryption functions at runtime.

## Database Monitoring

### Performance Views

The database includes views for monitoring performance and identifying optimization opportunities:

**Slow Queries View**: Queries the pg_stat_statements extension to identify queries with mean execution time exceeding 1 second. Returns the query text, call count, total execution time, mean execution time, and rows returned. This helps identify candidates for query optimization or index creation.

**Table Sizes View**: Provides a summary of storage consumption by table, including schema name, table name, human-readable size, and size in bytes. Tables are ordered by size descending to quickly identify the largest tables that may need partitioning or archival strategies.

## Backup and Recovery

### Backup Strategy

The database backup strategy includes multiple approaches for different recovery scenarios:

**Daily Full Backups**: Complete database dumps are generated daily using pg_dump, capturing all schema objects and data. Backups are compressed using gzip to reduce storage requirements.

**Point-in-Time Recovery**: Write-ahead log (WAL) archiving enables recovery to any point in time, useful for recovering from accidental data deletion or corruption.

**Backup Retention**: Daily backups are retained for 30 days, weekly backups for 3 months, and monthly backups for 1 year.

### Recovery Procedure

Database recovery involves the following steps:

1. **Service Stop**: The PostgreSQL service is stopped to prevent new connections and data modifications during recovery
2. **Backup Restoration**: The appropriate backup file is restored using psql, either a full backup or a combination of base backup plus WAL replay for point-in-time recovery
3. **Service Restart**: PostgreSQL service is restarted after successful restoration
4. **Verification**: Data integrity checks are performed to confirm successful recovery

---

**Document Links**:
- [API Specification](api-specification.md) - Previous: REST API endpoints
- [Storage Strategy](storage-strategy.md) - Next: Image storage and processing
