//
//  Event.m
//  MG
//
//  Created by Tim Debo on 5/23/14.
//
//

#import "Event.h"
#import "JSON.h"

@implementation Event

+ (void) triggerEvent:(NSString *)event forWebView:(WebView *)webView {
    [self triggerEvent:event withArgs:[NSMutableDictionary dictionary] forObject:@"document" forWebView:webView];
}

+ (void) triggerEvent:(NSString *)event withArgs:(NSDictionary *)args forWebView:(WebView *)webView {
    [self triggerEvent:event withArgs:args forObject:@"document" forWebView:webView];
}

+ (void) triggerEvent:(NSString *)event withArgs:(NSDictionary *)args forObject:(NSString *)objName forWebView:(WebView *)webView {
    
    NSString * str = [NSString stringWithFormat:@"var e = document.createEvent('Events'); e.initEvent('%@', true, false);  e.data=%@; %@.dispatchEvent(e);", event, args.JSONString, objName];
    [webView stringByEvaluatingJavaScriptFromString:str];
}

+ (void) triggerDomEvent:(NSString *)event withArgs:(NSDictionary *)args forWebView:(WebView *)webView {
    
    NSString * str = [NSString stringWithFormat:@"var e = new CustomEvent('%@', %@); document.dispatchEvent(e);", event, args.JSONString];
    [webView stringByEvaluatingJavaScriptFromString:str];
}

@end
