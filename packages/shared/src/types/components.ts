// ============================================================================
// Component Types - All allowed component types and their props
// ============================================================================

import { z } from 'zod';

// Component Type Enum
export const ComponentTypeSchema = z.enum([
    // Layout
    'Screen',
    'Row',
    'Column',
    'Stack',
    'Grid',
    // Containers
    'Card',
    'Section',
    'Divider',
    // Content
    'Text',
    'Icon',
    'Image',
    // Form
    'Button',
    'Input',
    'TextArea',
    'Select',
    'Checkbox',
    'Switch',
    // Data Display
    'Table',
    'List',
    'ListItem',
    'Badge',
    'Avatar',
    // Navigation
    'NavBar',
    'SideBar',
    'Tabs',
    'TabItem',
]);

export type ComponentType = z.infer<typeof ComponentTypeSchema>;

// Token Reference - references a token by path like "tokens.colors.primary"
export const TokenRefSchema = z.string().regex(/^tokens\.[a-zA-Z.]+$/);
export type TokenRef = z.infer<typeof TokenRefSchema>;

// Style value - either a token reference or a direct value
export const StyleValueSchema = z.union([TokenRefSchema, z.string(), z.number()]);
export type StyleValue = z.infer<typeof StyleValueSchema>;

// Flex Align/Justify
export const FlexAlignSchema = z.enum(['flex-start', 'flex-end', 'center', 'stretch', 'baseline']);
export const FlexJustifySchema = z.enum(['flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly']);
export const FlexDirectionSchema = z.enum(['row', 'column', 'row-reverse', 'column-reverse']);
export const FlexWrapSchema = z.enum(['nowrap', 'wrap', 'wrap-reverse']);

// Layout Rules Schema
export const LayoutRulesSchema = z.object({
    flex: z.number().optional(),
    flexGrow: z.number().optional(),
    flexShrink: z.number().optional(),
    flexBasis: z.union([z.number(), z.string()]).optional(),
    alignSelf: FlexAlignSchema.optional(),
    width: z.union([z.number(), z.string(), StyleValueSchema]).optional(),
    height: z.union([z.number(), z.string(), StyleValueSchema]).optional(),
    minWidth: z.union([z.number(), z.string()]).optional(),
    maxWidth: z.union([z.number(), z.string()]).optional(),
    minHeight: z.union([z.number(), z.string()]).optional(),
    maxHeight: z.union([z.number(), z.string()]).optional(),
    padding: StyleValueSchema.optional(),
    paddingTop: StyleValueSchema.optional(),
    paddingRight: StyleValueSchema.optional(),
    paddingBottom: StyleValueSchema.optional(),
    paddingLeft: StyleValueSchema.optional(),
    paddingX: StyleValueSchema.optional(),
    paddingY: StyleValueSchema.optional(),
    margin: StyleValueSchema.optional(),
    marginTop: StyleValueSchema.optional(),
    marginRight: StyleValueSchema.optional(),
    marginBottom: StyleValueSchema.optional(),
    marginLeft: StyleValueSchema.optional(),
    marginX: StyleValueSchema.optional(),
    marginY: StyleValueSchema.optional(),
    gap: StyleValueSchema.optional(),
    flexDirection: FlexDirectionSchema.optional(),
    flexWrap: FlexWrapSchema.optional(),
    justifyContent: FlexJustifySchema.optional(),
    alignItems: FlexAlignSchema.optional(),
    position: z.enum(['relative', 'absolute']).optional(),
    top: z.union([z.number(), z.string()]).optional(),
    right: z.union([z.number(), z.string()]).optional(),
    bottom: z.union([z.number(), z.string()]).optional(),
    left: z.union([z.number(), z.string()]).optional(),
});

export type LayoutRules = z.infer<typeof LayoutRulesSchema>;

// Style Reference Schema
export const StyleRefSchema = z.object({
    backgroundColor: StyleValueSchema.optional(),
    color: StyleValueSchema.optional(),
    borderColor: StyleValueSchema.optional(),
    borderWidth: z.number().optional(),
    borderRadius: StyleValueSchema.optional(),
    borderTopLeftRadius: StyleValueSchema.optional(),
    borderTopRightRadius: StyleValueSchema.optional(),
    borderBottomLeftRadius: StyleValueSchema.optional(),
    borderBottomRightRadius: StyleValueSchema.optional(),
    shadow: z.enum(['none', 'sm', 'md', 'lg', 'xl']).optional(),
    opacity: z.number().min(0).max(1).optional(),
    typography: z.string().optional(), // Reference to typography scale key
});

export type StyleRef = z.infer<typeof StyleRefSchema>;

// ============================================================================
// Component Props by Type
// ============================================================================

// Screen Props
export const ScreenPropsSchema = z.object({
    name: z.string().optional(),
});

// Row Props
export const RowPropsSchema = z.object({});

// Column Props
export const ColumnPropsSchema = z.object({});

// Stack Props (absolute positioning container)
export const StackPropsSchema = z.object({});

// Grid Props
export const GridPropsSchema = z.object({
    columns: z.number().optional(),
    rows: z.number().optional(),
});

// Card Props
export const CardPropsSchema = z.object({
    elevated: z.boolean().optional(),
});

// Section Props
export const SectionPropsSchema = z.object({
    title: z.string().optional(),
});

// Divider Props
export const DividerPropsSchema = z.object({
    orientation: z.enum(['horizontal', 'vertical']).optional(),
    thickness: z.number().optional(),
});

// Text Props
export const TextPropsSchema = z.object({
    content: z.string(),
    variant: z.enum(['displayLarge', 'displayMedium', 'displaySmall', 'headingLarge', 'headingMedium', 'headingSmall', 'bodyLarge', 'bodyMedium', 'bodySmall', 'caption', 'label']).optional(),
    align: z.enum(['left', 'center', 'right']).optional(),
    truncate: z.boolean().optional(),
    maxLines: z.number().optional(),
});

// Icon Props
export const IconPropsSchema = z.object({
    name: z.string(),
    size: z.number().optional(),
});

// Image Props
export const ImagePropsSchema = z.object({
    src: z.string(),
    alt: z.string().optional(),
    fit: z.enum(['cover', 'contain', 'fill', 'none']).optional(),
});

// Button Props
export const ButtonPropsSchema = z.object({
    label: z.string(),
    variant: z.enum(['primary', 'secondary', 'outline', 'ghost', 'danger']).optional(),
    size: z.enum(['sm', 'md', 'lg']).optional(),
    disabled: z.boolean().optional(),
    fullWidth: z.boolean().optional(),
    icon: z.string().optional(),
    iconPosition: z.enum(['left', 'right']).optional(),
});

// Input Props
export const InputPropsSchema = z.object({
    placeholder: z.string().optional(),
    value: z.string().optional(),
    inputType: z.enum(['text', 'email', 'password', 'number', 'tel', 'url']).optional(),
    disabled: z.boolean().optional(),
    label: z.string().optional(),
    helperText: z.string().optional(),
    error: z.string().optional(),
});

// TextArea Props
export const TextAreaPropsSchema = z.object({
    placeholder: z.string().optional(),
    value: z.string().optional(),
    rows: z.number().optional(),
    disabled: z.boolean().optional(),
    label: z.string().optional(),
});

// Select Props
export const SelectPropsSchema = z.object({
    placeholder: z.string().optional(),
    value: z.string().optional(),
    options: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
    disabled: z.boolean().optional(),
    label: z.string().optional(),
});

// Checkbox Props
export const CheckboxPropsSchema = z.object({
    label: z.string().optional(),
    checked: z.boolean().optional(),
    disabled: z.boolean().optional(),
});

// Switch Props
export const SwitchPropsSchema = z.object({
    label: z.string().optional(),
    checked: z.boolean().optional(),
    disabled: z.boolean().optional(),
});

// Table Props
export const TablePropsSchema = z.object({
    headers: z.array(z.string()).optional(),
    rows: z.array(z.array(z.string())).optional(),
});

// List Props
export const ListPropsSchema = z.object({
    variant: z.enum(['default', 'bordered', 'divided']).optional(),
});

// ListItem Props
export const ListItemPropsSchema = z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    leadingIcon: z.string().optional(),
    trailingIcon: z.string().optional(),
});

// Badge Props
export const BadgePropsSchema = z.object({
    text: z.string(),
    variant: z.enum(['default', 'primary', 'secondary', 'success', 'warning', 'error']).optional(),
    size: z.enum(['sm', 'md', 'lg']).optional(),
});

// Avatar Props
export const AvatarPropsSchema = z.object({
    src: z.string().optional(),
    name: z.string().optional(),
    size: z.enum(['xs', 'sm', 'md', 'lg', 'xl']).optional(),
});

// NavBar Props
export const NavBarPropsSchema = z.object({
    title: z.string().optional(),
    showBackButton: z.boolean().optional(),
});

// SideBar Props
export const SideBarPropsSchema = z.object({
    collapsed: z.boolean().optional(),
});

// Tabs Props
export const TabsPropsSchema = z.object({
    activeTab: z.number().optional(),
});

// TabItem Props
export const TabItemPropsSchema = z.object({
    label: z.string(),
    icon: z.string().optional(),
});

// Union of all component props
export const ComponentPropsSchema = z.union([
    ScreenPropsSchema,
    RowPropsSchema,
    ColumnPropsSchema,
    StackPropsSchema,
    GridPropsSchema,
    CardPropsSchema,
    SectionPropsSchema,
    DividerPropsSchema,
    TextPropsSchema,
    IconPropsSchema,
    ImagePropsSchema,
    ButtonPropsSchema,
    InputPropsSchema,
    TextAreaPropsSchema,
    SelectPropsSchema,
    CheckboxPropsSchema,
    SwitchPropsSchema,
    TablePropsSchema,
    ListPropsSchema,
    ListItemPropsSchema,
    BadgePropsSchema,
    AvatarPropsSchema,
    NavBarPropsSchema,
    SideBarPropsSchema,
    TabsPropsSchema,
    TabItemPropsSchema,
]);

export type ComponentProps = z.infer<typeof ComponentPropsSchema>;

// Map type to props schema for validation
export const propsSchemaByType: Record<ComponentType, z.ZodType> = {
    Screen: ScreenPropsSchema,
    Row: RowPropsSchema,
    Column: ColumnPropsSchema,
    Stack: StackPropsSchema,
    Grid: GridPropsSchema,
    Card: CardPropsSchema,
    Section: SectionPropsSchema,
    Divider: DividerPropsSchema,
    Text: TextPropsSchema,
    Icon: IconPropsSchema,
    Image: ImagePropsSchema,
    Button: ButtonPropsSchema,
    Input: InputPropsSchema,
    TextArea: TextAreaPropsSchema,
    Select: SelectPropsSchema,
    Checkbox: CheckboxPropsSchema,
    Switch: SwitchPropsSchema,
    Table: TablePropsSchema,
    List: ListPropsSchema,
    ListItem: ListItemPropsSchema,
    Badge: BadgePropsSchema,
    Avatar: AvatarPropsSchema,
    NavBar: NavBarPropsSchema,
    SideBar: SideBarPropsSchema,
    Tabs: TabsPropsSchema,
    TabItem: TabItemPropsSchema,
};
