//
//  Fonts.m
//  MG
//
//  Created by Tim Debo on 5/27/14.
//
//

#import "Fonts.h"

@implementation Fonts

- (JSValue*) availableFonts {
    return [JSValue valueWithObject:[[NSFontManager sharedFontManager] availableFonts] inContext:[JSContext currentContext]];
}

- (JSValue*) availableFontFamilies {
    return [JSValue valueWithObject:[[NSFontManager sharedFontManager] availableFontFamilies] inContext:[JSContext currentContext]];
}

- (JSValue*) availableMembersOfFontFamily:(NSString *)fontFamily {
    return [JSValue valueWithObject:[[NSFontManager sharedFontManager] availableMembersOfFontFamily:fontFamily] inContext:[JSContext currentContext]];
}

- (CGFloat) defaultLineHeightForFont:(NSString*)theFontName ofSize:(CGFloat)theFontSize {
    NSFont *theFont = [NSFont fontWithName:theFontName size:theFontSize];
    NSLayoutManager *lm = [[NSLayoutManager alloc] init];
    
    return [lm defaultLineHeightForFont:theFont];
}

@end
