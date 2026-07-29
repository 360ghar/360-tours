# UI Components

## Executive Summary

This document outlines the comprehensive UI component system for the 360 Tours Platform. The component library is designed to ensure consistency, accessibility, and efficiency across all interfaces, from tour creation tools to the immersive viewer experience.

This platform is powered by the REST API (`../technical/api-specification.md`) and shared schemas (`../00-conventions.md`).

## Design System Philosophy

### Core Principles
- **Consistency**: Unified visual language and interaction patterns
- **Responsiveness**: Adaptive layouts for all device sizes
- **Customizability**: Branding and theme customization options
- **Performance**: Optimized for fast loading and smooth interactions

### Component Categories
1. **Foundation**: Colors, typography, spacing, and grid systems
2. **Basic Elements**: Buttons, inputs, navigation, and layout components
3. **Complex Components**: Tour editor, viewer, and analytics interfaces
4. **Interactive Elements**: Hotspots, transitions, and animations
5. **Feedback Systems**: Notifications, loaders, and status indicators

---

## Foundation Components

### 1. Color System

#### Primary Colors
- **Brand Blue**: #007bff (Primary brand color)
- **Success Green**: #28a745 (Positive actions)
- **Warning Orange**: #ffc107 (Alerts and warnings)
- **Danger Red**: #dc3545 (Error states)
- **Info Blue**: #17a2b8 (Informational messages)

#### Neutral Colors
- **Text Primary**: #333333 (Main body text)
- **Text Secondary**: #6c757d (Secondary text)
- **Text Muted**: #6c757d (Muted/disabled text)
- **Background**: #ffffff (Page backgrounds)
- **Surface**: #f8f9fa (Card surfaces)
- **Border**: #dee2e6 (Borders and dividers)

#### Semantic Colors
- **Success**: #28a745 (Successful states)
- **Warning**: #ffc107 (Attention needed)
- **Error**: #dc3545 (Error states)
- **Info**: #17a2b8 (Informational)
- **Primary**: #007bff (Brand actions)

### 2. Typography System

#### Font Stack
- **Primary**: Inter, -apple-system, BlinkMacSystemFont, sans-serif
- **Secondary**: Roboto, Arial, sans-serif
- **Monospace**: Fira Code, monospace

#### Typography Scale
- **Display**: 48px / 56px (Headlines)
- **Hero**: 36px / 44px (Page titles)
- **Headline**: 24px / 32px (Section headers)
- **Subheading**: 20px / 24px (Subsections)
- **Body**: 16px / 24px (Main content)
- **Caption**: 14px / 20px (Secondary text)
- **Label**: 12px / 16px (Labels and metadata)

#### Typography Hierarchy
- **H1**: Display size, bold
- **H2**: Hero size, semi-bold
- **H3**: Headline size, medium
- **H4**: Subheading size, medium
- **H5**: Body size, medium
- **H6**: Caption size, medium

### 3. Spacing System

#### Scale
- **XS**: 4px (Micro-interactions)
- **SM**: 8px (Component padding)
- **MD**: 16px (Component margins)
- **LG**: 24px (Section spacing)
- **XL**: 32px (Block spacing)
- **XXL**: 48px (Large sections)

#### Responsive Spacing
- Mobile: Base scale (4px increments)
- Tablet: Scale up by 1.25x
- Desktop: Full scale

### 4. Grid System

#### Breakpoints
- **Mobile**: 0-768px
- **Tablet**: 769-1024px
- **Desktop**: 1025px+
- **Large Desktop**: 1440px+

#### Grid System
- **12-column grid** for layouts
- **Gutter system** with consistent spacing
- **Offset classes** for alignment
- **Push/pull utilities** for reordering

## Basic UI Components

### 1. Buttons

#### Button Types
- **Primary**: Main action button
- **Secondary**: Secondary action button
- **Tertiary**: Less emphasized action
- **Ghost**: Subtle action button
- **Text**: Clickable text element

#### Button States
- **Default**: Normal state
- **Hover**: User hover interaction
- **Active**: Button being pressed
- **Focus**: Keyboard navigation
- **Disabled**: Non-interactive state

#### Button Sizes
- **Small**: Compact actions (32px height)
- **Medium**: Standard actions (40px height)
- **Large**: Primary actions (48px height)

### 2. Inputs & Forms

#### Input Types
- **Text Input**: Single-line text entry
- **Textarea**: Multi-line text entry
- **Select**: Dropdown selection
- **Checkbox**: Multiple selection
- **Radio**: Single selection from options

#### Form Validation
- **Real-time validation**: Immediate feedback
- **Error states**: Clear error messaging
- **Success states**: Positive confirmation
- **Loading states**: Processing indication

#### Form Layouts
- **Vertical forms**: One column, stacked
- **Horizontal forms**: Two column layout
- **Grid forms**: Multi-column responsive
- **Inline forms**: Compact single row

### 3. Navigation Components

#### Navigation Types
- **Header Navigation**: Primary page navigation
- **Breadcrumbs**: Hierarchical navigation
- **Tabs**: Section switching
- **Steppers**: Multi-step processes
- **Side Navigation**: Section-based navigation

#### Navigation Patterns
- **Mega menus**: Extended dropdown menus
- **Context menus**: Right-click actions
- **Pagination**: Content navigation
- **Pagination Controls**: Data navigation

### 4. Layout Components

#### Container Systems
- **Page Container**: Page-level container
- **Card Container**: Content sections
- **Grid Container**: Layout grid system
- **Flex Container**: Flexible layout system

#### Layout Components
- **Grid System**: Responsive grid layouts
- **Flexbox**: Flexible alignment components
- **Stack**: Vertical stacking components
- **Split**: Two-panel layouts

## Complex Interface Components

### 1. Tour Editor Interface

#### Editor Structure
- **Toolbar Component**: Editor tools and actions
- **Scene Browser**: Scene management interface
- **Properties Panel**: Scene and element properties
- **Preview Area**: Live tour preview
- **Hotspot Manager**: Interactive hotspot management

#### Scene Management
- **Scene List**: Ordered scene listing
- **Scene Preview**: Thumbnail previews
- **Scene Actions**: Scene manipulation tools
- **Scene Navigation**: Scene traversal controls

#### Hotspot Management
- **Hotspot Creation**: Interactive hotspot placement
- **Hotspot Properties**: Hotspot configuration
- **Hotspot Testing**: Live interaction testing
- **Hotspot Organization**: Grouping and categorization

### 2. Tour Viewer Interface

#### Viewer Structure
- **Main Viewport**: Primary 360 degree viewing area
- **Navigation Controls**: Scene and movement controls
- **Hotspot Interface**: Interactive hotspot elements
- **Information Panels**: Contextual information display
- **Menu Systems**: Viewer options and controls

#### Viewer Controls
- **Navigation Controls**: Movement and direction controls
- **View Controls**: Zoom and perspective controls
- **Menu Systems**: Settings and options menus
- **Keyboard Controls**: Keyboard navigation support

#### Hotspot Interface
- **Hotspot Markers**: Visual hotspot indicators
- **Hotspot Content**: Popup and inline content
- **Hotspot Animations**: Interactive animations
- **Hotspot Navigation**: Scene switching hotspots

### 3. Dashboard Components

#### Dashboard Structure
- **Header Component**: User info and notifications
- **Sidebar Navigation**: Main navigation structure
- **Content Area**: Main dashboard content
- **Statistics Cards**: Key metric displays
- **Data Visualizations**: Charts and graphs

#### Statistics Components
- **Metric Cards**: Individual metric displays
- **Progress Bars**: Visual progress indicators
- **Status Indicators**: Status and health indicators
- **Trend Indicators**: Direction and change indicators

#### Data Visualization
- **Line Charts**: Trend analysis
- **Bar Charts**: Comparative data
- **Pie Charts**: Proportional data
- **Heat Maps**: Data intensity visualization
- **Geographic Maps**: Location-based data

### 4. Analytics Interface

#### Analytics Structure
- **Time Period Selector**: Date range selection
- **Metric Selector**: Custom metric selection
- **Data Display**: Data visualization area
- **Export Controls**: Data export and sharing
- **Comparison Tools**: Data comparison features

#### Analytics Components
- **Date Range Picker**: Time period selection
- **Metric Selector**: Metric configuration
- **Chart Types**: Multiple visualization options
- **Data Tables**: Tabular data display
- **Export Tools**: Data export functionality

## Interactive Components

### 1. Transitions & Animations

#### Transition Types
- **Fade**: Opacity transitions
- **Slide**: Position-based transitions
- **Scale**: Size-based transitions
- **Rotate**: Rotation-based transitions
- **Bounce**: Elastic transitions

#### Animation Patterns
- **Micro-interactions**: Small, subtle animations
- **Loading animations**: Activity indicators
- **Success animations**: Confirmation feedback
- **Error animations**: Error state feedback
- **Navigation animations**: Page and component transitions

### 2. Feedback Systems

#### Notification Types
- **Success Notifications**: Positive feedback
- **Warning Notifications**: Attention needed
- **Error Notifications**: Error state feedback
- **Info Notifications**: Informational messages
- **Progress Notifications**: Activity completion

#### Loading States
- **Spinners**: Loading indicators
- **Progress bars**: Activity progress
- **Skeleton loaders**: Content placeholder loading
- **Inline loaders**: Component-level loading
- **Full page loaders**: Page-level loading

#### User Feedback
- **Toasts**: Temporary message notifications
- **Modals**: Modal dialog feedback
- **Inline messages**: Component-level feedback
- **Status indicators**: Status update feedback
- **Progress indicators**: Completion status feedback

## Responsive Components

### 1. Mobile-First Design

#### Mobile Adaptations
- **Touch targets**: Appropriate sizing for touch interaction
- **Gestures support**: Swipe, pinch, and tap interactions
- **Mobile navigation**: Optimized navigation patterns
- **Screen estate usage**: Efficient space utilization
- **Offline support**: Limited connectivity functionality

#### Mobile Components
- **Mobile navigation**: Touch-optimized navigation
- **Swipe interfaces**: Gesture-based navigation
- **Pull-to-refresh**: Content refresh patterns
- **Bottom sheets**: Modal interfaces
- **Floating action buttons**: Primary action positioning

### 2. Tablet Adaptations

#### Tablet Considerations
- **Split-screen layouts**: Multitasking support
- **Adaptive navigation**: Context-aware navigation
- **Larger touch targets**: Enhanced touch interactions
- **Optimized spacing**: Tablet-specific spacing adjustments
- **Flexible layouts**: Adaptive component arrangements

### 3. Desktop Optimizations

#### Desktop Features
- **Mouse interactions**: Enhanced cursor interactions
- **Keyboard shortcuts**: Efficient keyboard navigation
- **Multi-window support**: Application windowing
- **Drag and drop**: Interactive content manipulation
- **Enhanced navigation**: Complex navigation patterns

## Component Implementation Standards

### 1. Component Architecture

#### Component Structure
- **Atomic design**: Fundamental building blocks
- **Component composition**: Reusable component combinations
- **State management**: Consistent state handling
- **Prop drilling**: Controlled prop passing
- **Event handling**: Standardized event management

#### Documentation Standards
- **Component documentation**: Usage examples and guidelines
- **Responsive documentation**: Breakpoint behavior documentation
- **Testing documentation**: Test coverage and requirements
- **Performance documentation**: Optimization guidelines

### 2. Styling System

#### CSS Architecture
- **Utility classes**: Reusable utility classes
- **Component styles**: Component-specific styles
- **Theme variables**: Theming and customization
- **Responsive design**: Breakpoint-specific styles
- **State management**: Interactive state styles

#### Design Tokens
- **Color tokens**: Color system definitions
- **Typography tokens**: Typography system definitions
- **Spacing tokens**: Spacing system definitions
- **Border tokens**: Border and styling definitions
- **Animation tokens**: Animation timing and easing definitions

### 3. Performance Considerations

#### Performance Optimization
- **Lazy loading**: Component and content lazy loading
- **Virtual scrolling**: Efficient large list rendering
- **Image optimization**: Optimized image handling
- **Code splitting**: Optimized bundle sizes
- **Caching strategies**: Component and data caching

## Component Library Structure

### 1. Organization

#### Folder Structure
- **Foundation**: Basic design tokens and utilities
- **Components**: Reusable UI components
- **Layouts**: Page and section layouts
- **Templates**: Common page templates
- **Hooks**: Custom React hooks for functionality

#### Version Control
- **Semantic versioning**: Clear version updates
- **Change tracking**: Component change documentation
- **Deprecation process**: Graceful component retirement
- **Breaking changes**: Clear communication of changes
- **Migration guides**: Update and upgrade assistance

### 2. Documentation

#### Component Documentation
- **Usage examples**: Implementation examples
- **Props documentation**: Component property documentation
- **Event documentation**: Event handling information
- **Performance notes**: Optimization guidelines

### 3. Testing

#### Testing Strategies
- **Unit testing**: Component function testing
- **Integration testing**: Component interaction testing
- **Performance testing**: Component performance validation
- **Visual testing**: Visual appearance verification

---

**Document Links**:
- [User Flows](user-flows.md) <- Previous: Complete user journey maps
- [UI Components](ui-components.md) <- Current: Design system and components
- [Technical Architecture](../technical/architecture.md) -> Technical implementation details
