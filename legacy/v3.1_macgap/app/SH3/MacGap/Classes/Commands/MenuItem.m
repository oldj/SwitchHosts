//
//  MenuItem.m
//  MG
//
//  Created by Tim Debo on 5/23/14.
//
//

#import "MenuItem.h"
#import "Menu.h"

@interface MenuItem ()
{
    JSContext* context;
}
@property (readwrite) JSValue* submenu;
@property (strong) JSContext* context;

- (void) fireCallback;

@end;

@implementation MenuItem

@synthesize callback, submenu, enabled, item, context;

+ (MenuItem*) menuItemWithContext: (JSContext*) context andMenu: (NSMenuItem*) aMenuItem
{
    MenuItem *ret = [aMenuItem representedObject];
    if (ret)
    {
        NSLog(@"MI Cache Hit");
        return ret;
    }
    return [[MenuItem alloc] initWithContext:context andMenuItem:aMenuItem];

}
- (id) initWithContext:(JSContext*)aContext andMenuItem:(NSMenuItem*)anItem
{
    NSAssert(anItem, @"anItem required");
    self = [super init]; //initWithContext:aContext];
    if (!self)
        return nil;
    item = anItem;
    item.representedObject = self;
    self.context = aContext;
    self.enabled = [anItem isEnabled];
    NSMenu* subMenu = [item submenu];
    if(subMenu) {
       
        self.submenu = [JSValue valueWithObject: [Menu menuWithContext: aContext andMenu: subMenu] inContext:aContext];
    }
    
    return self;
}

- (void) fireCallback
{
    
    [callback callWithArguments: @[]];
}

- (void) setCallback:(JSValue*)aCallback
{
    
    callback = aCallback;
    [item setAction:@selector(fireCallback)];
    [item setTarget:self];
}
- (void) setEnabled:(BOOL) val
{
    if(!val || val == NO) {
         enabled = NO;
        [item setEnabled: NO];
    }
    if(val == YES) {
        enabled = YES;
        [item setEnabled:enabled];

    }
    
}

- (JSValue*)addSubmenu: (NSString*) aTitle
{
    NSMenu *s = [item submenu];
    if (!s)
    {
        NSString *title = nil;
        if(!aTitle || [aTitle isKindOfClass:[NSNull class]]) {
            title = @"";
        }
        s = [[NSMenu alloc] initWithTitle:title];
        [item setSubmenu:s];
        self.submenu = [JSValue valueWithObject: [Menu menuWithContext: self.context andMenu: s] inContext:self.context];
    }
    return self.submenu;
}

- (void) setLabel: (NSString*) aLabel
{
    if(aLabel && ![aLabel isKindOfClass: [NSNull class]]) {
        [item setTitle: aLabel];
    }
    
}
- (void) remove
{
    NSMenu *menu = [item menu];
    [menu removeItem:item];
}

- (void) dealloc
{
    NSLog(@"Menu Item Deallocated");
}
@end
